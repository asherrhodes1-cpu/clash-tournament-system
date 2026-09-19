import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  getDoc,
  onSnapshot,
  query,
  orderBy,
  where,
  or,
  arrayUnion,
  arrayRemove,
  deleteField,
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
    // Stored as a real UTC instant (not the bare "YYYY-MM-DDTHH:mm" the
    // <input type="datetime-local"> gives us) so the server-side auto-start
    // check reads the exact same moment the creator picked, regardless of
    // whose timezone is doing the parsing.
    signupDeadline: tournamentData.signupDeadline ? new Date(tournamentData.signupDeadline).toISOString() : null,
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

// Format only makes sense to change before the bracket exists - the
// security rules independently enforce staff-only, but this guard keeps a
// stale UI from ever attempting it on a tournament that's already running.
export async function updateTournamentFormat(tournamentId, format) {
  const snap = await getDoc(tournamentRef(tournamentId));
  if (snap.exists() && snap.data().status !== 'signups_open') {
    throw new Error('Format can only be changed before the tournament starts');
  }
  await updateDoc(tournamentRef(tournamentId), { format });
}

// Stored as a real UTC instant (not the bare "YYYY-MM-DDTHH:mm" an
// <input type="datetime-local"> gives us) so the server-side auto-start
// check reads the exact same moment the staff member picked, regardless of
// whose timezone is doing the parsing. Pass null/empty to clear it.
export async function updateTournamentSignupDeadline(tournamentId, deadline) {
  const snap = await getDoc(tournamentRef(tournamentId));
  if (snap.exists() && snap.data().status !== 'signups_open') {
    throw new Error('Signup deadline can only be changed before the tournament starts');
  }
  await updateDoc(tournamentRef(tournamentId), {
    signupDeadline: deadline ? new Date(deadline).toISOString() : null,
  });
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
          unlockAt: now,
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
        // Marks a tournament that advances slot by slot (functions/doubleElim.js).
        advancementVersion: 2,
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
          unlockAt: now,
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

    // unlockAt is set once, at the moment this round was actually created -
    // giving it a real, fixed 24h window regardless of how long earlier
    // rounds took. Older matches (from before this field existed) fall back
    // to the static day-number formula.
    let unlockTime = m.unlockAt;
    if (unlockTime == null) {
      const tSnap = await tx.get(tournamentRef(tournamentId));
      unlockTime = getRoundUnlockTime(tSnap.data(), m.day ?? m.round);
    }
    if (unlockTime && Date.now() < unlockTime) {
      throw new Error(`This round hasn't unlocked yet. Check back soon.`);
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

// Also doubles as staff's general-purpose "force a winner" override - not
// just for disputes/timeouts, but any still-open match, so a clog like a
// pile of players who never readied up doesn't need to wait on the
// automated timeout/grace machinery to get unstuck.
export async function resolveDispute(tournamentId, matchId, winner, resolvedByUsername) {
  await runTransaction(db, async (tx) => {
    const ref = matchRef(tournamentId, matchId);
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const m = snap.data();

    if (m.status === 'completed') {
      throw new Error('This match was already resolved.');
    }

    tx.update(ref, {
      status: 'completed',
      winner,
      resolvedBy: resolvedByUsername,
      resolvedReason: 'staff_override',
      completedAt: Date.now(),
    });
  });
}

// Undoes a staff removal: puts the player back in the tournament and reopens
// the matches that removal handed to their opponent. The scheduler creates the
// next round the moment every match in a round is decided, with the opponent
// already advanced - by then a match can't be quietly reopened without
// breaking the bracket, so this refuses instead. Matches keep their ready
// flags and votes through a removal, so the status they had is rebuilt from
// those.
export async function reinstatePlayer(tournament, matches, username) {
  if (tournament.status !== 'in_progress') {
    throw new Error('Players can only be reinstated while the tournament is in progress.');
  }
  const removedMatches = matches.filter(
    (m) => m.resolvedReason === 'player_removed' && (m.player1 === username || m.player2 === username)
  );
  if (removedMatches.length === 0) {
    throw new Error(`${username} has no match that was decided by removing them, so there's nothing to restore.`);
  }
  const alreadyAdvanced = removedMatches.some((m) => matches.some((other) => other.round > m.round));
  if (alreadyAdvanced) {
    throw new Error(
      `The next round has already been created with ${username}'s opponent advanced, so they can't be reinstated automatically.`
    );
  }

  const batch = writeBatch(db);
  removedMatches.forEach((m) => {
    batch.update(matchRef(tournament.id, m.id), {
      status: statusBeforeResolution(m),
      winner: null,
      completedAt: null,
      resolvedBy: deleteField(),
      resolvedReason: deleteField(),
    });
  });
  batch.update(tournamentRef(tournament.id), {
    players: arrayUnion(username),
    removedPlayers: arrayRemove(username),
  });
  await batch.commit();
}

// A resolved match keeps its ready flags and votes, so the status it had
// before it was decided can be rebuilt from them.
function statusBeforeResolution(m) {
  const bothReady = m.player1Ready && m.player2Ready;
  const hasVote = m.winner1Vote || m.winner2Vote;
  return bothReady ? (hasVote ? 'waiting_for_opponent' : 'scheduled') : 'pending';
}

function checkCanRevisitResult(tournament, m) {
  if (tournament.status !== 'in_progress') {
    throw new Error('Results can only be changed while the tournament is in progress.');
  }
  if (!m || m.status !== 'completed' || m.resolvedReason !== 'staff_override') {
    throw new Error('Only a result that staff decided by hand can be changed here.');
  }
}

// Reopens a match staff decided by hand, as if it hadn't been decided. Only
// safe while nothing has been built on the result - the moment a later round
// exists, the wrong player is already in it.
export async function reopenMatch(tournament, matches, matchId) {
  const m = matches.find((x) => x.id === matchId);
  checkCanRevisitResult(tournament, m);
  if (matches.some((x) => x.round > m.round)) {
    throw new Error('The next round has already been created, so this match can\'t simply be reopened. Switch the winner instead.');
  }
  await updateDoc(matchRef(tournament.id, matchId), {
    status: statusBeforeResolution(m),
    winner: null,
    completedAt: null,
    resolvedBy: deleteField(),
    resolvedReason: deleteField(),
  });
}

// Corrects a hand-decided winner to the other player. If the wrong winner has
// already been placed in the next round, they're swapped out of that match for
// the right one - but only while that match hasn't started, and only in single
// elimination, where a bracket slot is just "whoever won this match". Anything
// further along, or double elimination (where the loser also dropped
// somewhere), is refused instead of half-fixed.
export async function changeMatchWinner(tournament, matches, matchId, newWinner, byUsername) {
  const m = matches.find((x) => x.id === matchId);
  checkCanRevisitResult(tournament, m);
  if (newWinner !== m.player1 && newWinner !== m.player2) throw new Error('That player isn\'t in this match.');
  if (newWinner === m.winner) throw new Error(`${newWinner} is already the winner.`);
  const wrongWinner = m.winner;

  const later = matches.filter((x) => x.round > m.round);
  const batch = writeBatch(db);
  batch.update(matchRef(tournament.id, matchId), {
    winner: newWinner,
    resolvedBy: byUsername,
    resolvedReason: 'staff_override',
    completedAt: Date.now(),
  });

  if (later.length > 0) {
    if (tournament.format === 'double_elimination') {
      throw new Error('The next round has already been created, and in double elimination the loser has moved on too, so this needs fixing by hand.');
    }
    if (later.some((x) => x.round > m.round + 1)) {
      throw new Error('Later rounds have already been created with the wrong winner in them, so this needs fixing by hand.');
    }
    const next = later.find((x) => x.player1 === wrongWinner || x.player2 === wrongWinner);
    if (!next) throw new Error('Couldn\'t find where the winner was placed in the next round, so this needs fixing by hand.');
    const isBye = next.player1 === 'BYE' || next.player2 === 'BYE';
    const started = next.player1Ready || next.player2Ready || next.winner1Vote || next.winner2Vote ||
      (next.status !== 'pending' && !(isBye && next.status === 'completed'));
    if (started) throw new Error(`${wrongWinner} has already started their next match, so this needs fixing by hand.`);

    const slot = next.player1 === wrongWinner ? 'player1' : 'player2';
    const stats = tournament.playerStats?.[newWinner] || null;
    const update = { [slot]: newWinner, [`${slot}Tag`]: stats?.tag || '', [`${slot}Stats`]: stats };
    if (isBye) update.winner = newWinner; // a bye's winner is the one player in it
    batch.update(matchRef(tournament.id, next.id), update);
  }
  await batch.commit();
}
