import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  where,
  or,
  arrayUnion,
  runTransaction,
  writeBatch,
  getDocs,
  collectionGroup,
} from 'firebase/firestore';
import { db } from '../firebase';
import { generateSeededBracket, seedDoubleEliminationBracket, getRoundUnlockTime } from '../utils';
import { fetchClashPlayerData } from './clash';

const TOURNAMENTS = 'tournaments';
const TERMINAL_STATUSES = ['completed', 'disputed', 'needs_staff_review'];

function tournamentRef(tournamentId) {
  return doc(db, TOURNAMENTS, String(tournamentId));
}

function matchesRef(tournamentId) {
  return collection(db, TOURNAMENTS, String(tournamentId), 'matches');
}

function matchMessagesRef(tournamentId, matchId) {
  return collection(db, TOURNAMENTS, String(tournamentId), 'matches', matchId, 'messages');
}

export function subscribeToMatchMessages(tournamentId, matchId, onChange) {
  const q = query(matchMessagesRef(tournamentId, matchId), orderBy('timestamp'));
  return onSnapshot(q, (snapshot) => {
    onChange(snapshot.docs.map((d) => d.data()));
  });
}

export async function sendMatchMessage(tournamentId, matchId, sender, text) {
  await addDoc(matchMessagesRef(tournamentId, matchId), {
    sender,
    text,
    timestamp: Date.now(),
  });
}

function matchRef(tournamentId, matchId) {
  return doc(db, TOURNAMENTS, String(tournamentId), 'matches', matchId);
}

export function subscribeToTournaments(onChange) {
  return onSnapshot(collection(db, TOURNAMENTS), (snapshot) => {
    onChange(snapshot.docs.map((d) => d.data()));
  });
}

export function subscribeToMatches(tournamentId, onChange) {
  const q = query(matchesRef(tournamentId), orderBy('round'), orderBy('id'));
  return onSnapshot(q, (snapshot) => {
    onChange(snapshot.docs.map((d) => d.data()));
  });
}

// Used by the dashboard's "Pending Matches" stat, which spans every tournament
// the current user is part of, not just the one currently open.
export function subscribeToUserMatches(username, onChange) {
  const q = query(
    collectionGroup(db, 'matches'),
    or(where('player1', '==', username), where('player2', '==', username))
  );
  return onSnapshot(q, (snapshot) => {
    onChange(snapshot.docs.map((d) => d.data()));
  });
}

export async function createTournament(tournamentData, createdBy) {
  const id = Date.now();
  await setDoc(tournamentRef(id), {
    id,
    name: tournamentData.name,
    description: tournamentData.description,
    format: tournamentData.format,
    signupDeadline: tournamentData.signupDeadline || null,
    createdBy,
    players: [],
    status: 'signups_open',
    createdAt: new Date().toISOString(),
    removedPlayers: [],
    requiredBuilderHallLevel: tournamentData.requiredBuilderHallLevel || null,
    minBestTrophies: tournamentData.minBestTrophies || null,
    prize: tournamentData.prize || '',
    bannerPath: null,
  });
  return id;
}

export async function updateTournamentBanner(tournamentId, bannerPath) {
  await updateDoc(tournamentRef(tournamentId), { bannerPath, bannerPosition: { x: 50, y: 50 } });
}

export async function updateTournamentBannerPosition(tournamentId, bannerPosition) {
  await updateDoc(tournamentRef(tournamentId), { bannerPosition });
}

export async function joinTournament(tournament, user) {
  if (tournament.signupDeadline && new Date(tournament.signupDeadline) < new Date()) {
    throw new Error('Signups for this tournament have closed');
  }
  if (tournament.players.includes(user.username)) return;

  if (tournament.requiredBuilderHallLevel != null && user.builderHallLevel !== tournament.requiredBuilderHallLevel) {
    throw new Error(
      `This tournament requires Builder Hall ${tournament.requiredBuilderHallLevel}. Your verified Builder Hall is ${user.builderHallLevel ?? 'unverified'}.`
    );
  }
  if (tournament.minBestTrophies != null && (user.bestBuilderBaseTrophies ?? -1) < tournament.minBestTrophies) {
    throw new Error(
      `This tournament requires at least ${tournament.minBestTrophies} best trophies. Yours: ${user.bestBuilderBaseTrophies ?? 'unverified'}.`
    );
  }

  await updateDoc(tournamentRef(tournament.id), {
    players: arrayUnion(user.username),
  });
}

export async function deleteTournament(tournamentId) {
  const matchesSnap = await getDocs(matchesRef(tournamentId));
  const batch = writeBatch(db);
  matchesSnap.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(tournamentRef(tournamentId));
  await batch.commit();
}

export async function removePlayer(tournament, matches, username, removedByUsername) {
  const batch = writeBatch(db);
  const now = Date.now();

  if (tournament.status === 'signups_open') {
    batch.update(tournamentRef(tournament.id), {
      players: tournament.players.filter((p) => p !== username),
    });
  } else {
    matches.forEach((m) => {
      const isInMatch = m.player1 === username || m.player2 === username;
      const isUnresolved = !TERMINAL_STATUSES.includes(m.status);
      if (!isInMatch || !isUnresolved) return;

      const opponent = m.player1 === username ? m.player2 : m.player1;
      batch.update(matchRef(tournament.id, m.id), {
        status: 'completed',
        winner: opponent === 'BYE' ? null : opponent,
        resolvedBy: removedByUsername,
        resolvedReason: 'player_removed',
        completedAt: now,
      });
    });

    batch.update(tournamentRef(tournament.id), {
      players: tournament.players.filter((p) => p !== username),
      removedPlayers: [...(tournament.removedPlayers || []), username],
    });
  }

  await batch.commit();
}

async function lookupClashTags(usernames) {
  const usernamesLower = usernames.map((u) => u.toLowerCase());
  const byUsername = {};

  for (let i = 0; i < usernamesLower.length; i += 30) {
    const chunk = usernamesLower.slice(i, i + 30);
    const q = query(collection(db, 'users'), where('usernameLower', 'in', chunk));
    const snap = await getDocs(q);
    snap.docs.forEach((d) => {
      const data = d.data();
      byUsername[data.username] = data.clashTag;
    });
  }

  return byUsername;
}

export async function startTournament(tournament) {
  await updateDoc(tournamentRef(tournament.id), { status: 'loading_stats', bracket: [] });

  try {
    const clashTagsByUsername = await lookupClashTags(tournament.players);

    const playerStats = {};
    for (const player of tournament.players) {
      const clashTag = clashTagsByUsername[player];
      if (clashTag) {
        const stats = await fetchClashPlayerData(clashTag);
        if (stats) playerStats[player] = stats;
      }
    }

    const now = Date.now();
    const batch = writeBatch(db);
    const isDoubleElim = tournament.format === 'double_elimination';

    if (isDoubleElim) {
      const { pairs, bracketSize } = seedDoubleEliminationBracket(tournament.players, playerStats);

      pairs.forEach((pair, idx) => {
        const isBye = pair[1] === 'BYE';
        const matchId = `wb-r1-${idx}`;
        batch.set(matchRef(tournament.id, matchId), {
          id: matchId,
          tournamentId: tournament.id,
          player1: pair[0],
          player2: pair[1],
          player1Tag: playerStats[pair[0]]?.tag || '',
          player2Tag: playerStats[pair[1]]?.tag || '',
          player1Stats: playerStats[pair[0]] || null,
          player2Stats: playerStats[pair[1]] || null,
          round: 1,
          bracket: 'winners',
          status: isBye ? 'completed' : 'pending',
          winner: isBye ? pair[0] : null,
          completedAt: isBye ? now : null,
          player1Ready: false,
          player2Ready: false,
          player1ReadyTime: null,
          player2ReadyTime: null,
          scheduledStartTime: null,
          winner1Vote: null,
          winner2Vote: null,
          player1VoteTime: null,
          player2VoteTime: null,
          player1ScreenshotPaths: [],
          player2ScreenshotPaths: [],
        });
      });

      batch.update(tournamentRef(tournament.id), {
        status: 'in_progress',
        startedAt: now,
        bracketSize,
        playerStats,
      });
    } else {
      const bracket = generateSeededBracket(tournament.players, playerStats);

      bracket.forEach((pair, idx) => {
        const isBye = pair[1] === 'BYE';
        const matchId = `${tournament.id}-${idx}`;
        batch.set(matchRef(tournament.id, matchId), {
          id: matchId,
          tournamentId: tournament.id,
          player1: pair[0],
          player2: pair[1],
          player1Tag: playerStats[pair[0]]?.tag || '',
          player2Tag: playerStats[pair[1]]?.tag || '',
          player1Stats: playerStats[pair[0]] || null,
          player2Stats: playerStats[pair[1]] || null,
          round: 1,
          status: isBye ? 'completed' : 'pending',
          winner: isBye ? pair[0] : null,
          completedAt: isBye ? now : null,
          player1Ready: false,
          player2Ready: false,
          player1ReadyTime: null,
          player2ReadyTime: null,
          scheduledStartTime: null,
          winner1Vote: null,
          winner2Vote: null,
          player1VoteTime: null,
          player2VoteTime: null,
          player1ScreenshotPaths: [],
          player2ScreenshotPaths: [],
        });
      });

      batch.update(tournamentRef(tournament.id), {
        status: 'in_progress',
        startedAt: now,
        // Firestore doesn't allow arrays nested directly inside arrays, so store
        // pairs as objects instead of the [player1, player2] tuples used internally.
        bracket: bracket.map(([player1, player2]) => ({ player1, player2 })),
        playerStats,
      });
    }

    await batch.commit();
  } catch (err) {
    // Don't leave the tournament stuck on "loading_stats" if anything above throws.
    await updateDoc(tournamentRef(tournament.id), { status: 'signups_open' });
    throw err;
  }
}

export async function playerReady(tournamentId, matchId, username) {
  await runTransaction(db, async (tx) => {
    const ref = matchRef(tournamentId, matchId);
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const m = snap.data();

    const tSnap = await tx.get(tournamentRef(tournamentId));
    const unlockTime = getRoundUnlockTime(tSnap.data(), m.day ?? m.round);
    if (unlockTime && Date.now() < unlockTime) {
      throw new Error(`This round hasn't unlocked yet. Check back on Day ${m.round}.`);
    }

    const isPlayer1 = username === m.player1;
    const now = Date.now();
    const update = {
      [isPlayer1 ? 'player1Ready' : 'player2Ready']: true,
      [isPlayer1 ? 'player1ReadyTime' : 'player2ReadyTime']: now,
    };

    const player1Ready = isPlayer1 ? true : m.player1Ready;
    const player2Ready = isPlayer1 ? m.player2Ready : true;

    if (player1Ready && player2Ready && !m.scheduledStartTime) {
      update.status = 'scheduled';
      update.scheduledStartTime = now;
    } else if (player1Ready && player2Ready) {
      update.status = 'active';
    }

    tx.update(ref, update);
  });
}

export async function reportMatch(tournamentId, matchId, username, selectedWinner, screenshotPaths) {
  await runTransaction(db, async (tx) => {
    const ref = matchRef(tournamentId, matchId);
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const m = snap.data();

    const isPlayer1 = username === m.player1;
    const alreadyVoted = isPlayer1 ? m.winner1Vote : m.winner2Vote;
    if (alreadyVoted) {
      throw new Error('You already submitted a result for this match.');
    }

    const now = Date.now();
    const update = {
      [isPlayer1 ? 'winner1Vote' : 'winner2Vote']: selectedWinner,
      [isPlayer1 ? 'player1VoteTime' : 'player2VoteTime']: now,
      [isPlayer1 ? 'player1ScreenshotPaths' : 'player2ScreenshotPaths']: screenshotPaths,
    };

    const winner1Vote = isPlayer1 ? selectedWinner : m.winner1Vote;
    const winner2Vote = isPlayer1 ? m.winner2Vote : selectedWinner;

    if (winner1Vote && winner2Vote) {
      if (winner1Vote === winner2Vote) {
        update.status = 'completed';
        update.winner = winner1Vote;
        update.completedAt = now;
      } else {
        update.status = 'disputed';
      }
    } else {
      update.status = 'waiting_for_opponent';
    }

    tx.update(ref, update);
  });
}

export async function resolveDispute(tournamentId, matchId, winner, resolvedByUsername) {
  await runTransaction(db, async (tx) => {
    const ref = matchRef(tournamentId, matchId);
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const m = snap.data();

    if (!['disputed', 'needs_staff_review'].includes(m.status)) {
      throw new Error('This match was already resolved.');
    }

    tx.update(ref, {
      status: 'completed',
      winner,
      resolvedBy: resolvedByUsername,
      completedAt: Date.now(),
    });
  });
}
