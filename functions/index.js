const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { defineSecret } = require('firebase-functions/params');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

const STAFF_INVITE_CODE = defineSecret('STAFF_INVITE_CODE');
const CLASH_API_KEY = defineSecret('CLASH_API_KEY');
const CLASH_RELAY_SECRET = defineSecret('CLASH_RELAY_SECRET');
const DISCORD_WEBHOOK_URL = defineSecret('DISCORD_WEBHOOK_URL');
const CLASH_RELAY_URL = 'https://174-138-44-50.nip.io';
const EMAIL_DOMAIN = 'clash-tournament.local';
const TIMEOUT_MS = 16 * 60 * 60 * 1000;
const TERMINAL_STATUSES = ['completed', 'disputed', 'needs_staff_review'];

async function notifyDiscord(content) {
  try {
    await fetch(DISCORD_WEBHOOK_URL.value(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
  } catch (err) {
    logger.error('notifyDiscord failed', err);
  }
}

function usernameToEmail(username) {
  return `${username.trim().toLowerCase()}@${EMAIL_DOMAIN}`;
}

// ============================================================================
// Clash of Clans verification helpers. Player API tokens (from in-game
// Settings > More Settings) prove ownership of a tag via Supercell's
// /verifytoken endpoint - separate from our developer API key, which
// authenticates our server to the API generally.
// ============================================================================
async function callClashApi(path, options = {}) {
  return fetch(`${CLASH_RELAY_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${CLASH_API_KEY.value()}`,
      'X-Relay-Secret': CLASH_RELAY_SECRET.value(),
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
}

async function verifyAndFetchClashPlayer(cleanTag, apiToken) {
  const verifyResp = await callClashApi(`/v1/players/%23${cleanTag}/verifytoken`, {
    method: 'POST',
    body: JSON.stringify({ token: apiToken }),
  });
  if (!verifyResp.ok) {
    throw new HttpsError('invalid-argument', 'Could not verify that Clash of Clans tag - double check it and try again.');
  }
  const verifyData = await verifyResp.json();
  if (verifyData.status !== 'ok') {
    throw new HttpsError('invalid-argument', 'That API token does not match the given player tag.');
  }

  const playerResp = await callClashApi(`/v1/players/%23${cleanTag}`);
  if (!playerResp.ok) {
    throw new HttpsError('internal', 'Verified, but failed to fetch player stats. Please try again.');
  }
  const data = await playerResp.json();
  return {
    builderHallLevel: data.builderHallLevel || 0,
    bestBuilderBaseTrophies: data.bestBuilderBaseTrophies || 0,
  };
}

// ============================================================================
// signUp — creates an account. If a valid invite code is supplied, the account
// is marked staff. The invite code itself never reaches the client bundle.
// The player's Clash of Clans tag is verified via their in-game API token
// before the account is created, and their Builder Hall level and best
// Builder Base trophies are recorded from that verified lookup.
// ============================================================================
exports.signUp = onCall({ secrets: [STAFF_INVITE_CODE, CLASH_API_KEY, CLASH_RELAY_SECRET] }, async (request) => {
  const { username, password, clashTag, apiToken, inviteCode } = request.data || {};

  if (!username || typeof username !== 'string' || username.trim().length < 3) {
    throw new HttpsError('invalid-argument', 'Username must be at least 3 characters');
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    throw new HttpsError('invalid-argument', 'Password must be at least 6 characters');
  }
  if (!clashTag || typeof clashTag !== 'string' || !clashTag.startsWith('#')) {
    throw new HttpsError('invalid-argument', 'Clash tag must start with #');
  }
  if (!apiToken || typeof apiToken !== 'string' || apiToken.trim().length < 5) {
    throw new HttpsError('invalid-argument', 'Your Clash of Clans API token is required');
  }

  const cleanTag = clashTag.trim().toUpperCase().replace(/^#/, '');
  const clashStats = await verifyAndFetchClashPlayer(cleanTag, apiToken.trim());

  const usernameLower = username.trim().toLowerCase();
  const usernameDocRef = db.collection('usernames').doc(usernameLower);

  await db.runTransaction(async (tx) => {
    const existing = await tx.get(usernameDocRef);
    if (existing.exists) {
      throw new HttpsError('already-exists', 'Username already exists');
    }
    tx.set(usernameDocRef, { reserved: true });
  });

  const isStaff = !!inviteCode && inviteCode === STAFF_INVITE_CODE.value();

  let userRecord;
  try {
    userRecord = await admin.auth().createUser({
      email: usernameToEmail(username),
      password,
    });

    await admin.auth().setCustomUserClaims(userRecord.uid, {
      isStaff,
      username: username.trim(),
    });

    await db.collection('users').doc(userRecord.uid).set({
      username: username.trim(),
      usernameLower,
      clashTag: `#${cleanTag}`,
      isStaff,
      createdAt: new Date().toISOString(),
      clashVerified: true,
      builderHallLevel: clashStats.builderHallLevel,
      bestBuilderBaseTrophies: clashStats.bestBuilderBaseTrophies,
    });

    await usernameDocRef.set({ uid: userRecord.uid, username: username.trim() });
  } catch (err) {
    await usernameDocRef.delete();
    if (userRecord) {
      await admin.auth().deleteUser(userRecord.uid).catch(() => {});
    }
    logger.error('signUp failed', err);
    if (err instanceof HttpsError) throw err;
    if (err.code === 'auth/email-already-exists') {
      throw new HttpsError('already-exists', 'Username already exists');
    }
    throw new HttpsError('internal', 'Failed to create account');
  }

  return { success: true, isStaff };
});

// ============================================================================
// verifyClashAccount — lets an already-signed-in user (retroactively) verify
// or re-verify their own Clash of Clans tag via their in-game API token, the
// same way signUp does. Needed for accounts created before this existed.
// ============================================================================
exports.verifyClashAccount = onCall({ secrets: [CLASH_API_KEY, CLASH_RELAY_SECRET] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be signed in');
  }

  const { clashTag, apiToken } = request.data || {};
  if (!clashTag || typeof clashTag !== 'string' || !clashTag.startsWith('#')) {
    throw new HttpsError('invalid-argument', 'Clash tag must start with #');
  }
  if (!apiToken || typeof apiToken !== 'string' || apiToken.trim().length < 5) {
    throw new HttpsError('invalid-argument', 'API token is required');
  }

  const cleanTag = clashTag.trim().toUpperCase().replace(/^#/, '');
  const clashStats = await verifyAndFetchClashPlayer(cleanTag, apiToken.trim());

  await db.collection('users').doc(request.auth.uid).update({
    clashTag: `#${cleanTag}`,
    clashVerified: true,
    builderHallLevel: clashStats.builderHallLevel,
    bestBuilderBaseTrophies: clashStats.bestBuilderBaseTrophies,
  });

  return { success: true, ...clashStats };
});

// ============================================================================
// adminResetPassword — staff-only. Lets staff reset a player's password
// without needing real email-based password reset (accounts use synthesized
// emails and can't receive reset links).
// ============================================================================
exports.adminResetPassword = onCall(async (request) => {
  if (!request.auth || !request.auth.token.isStaff) {
    throw new HttpsError('permission-denied', 'Staff only');
  }

  const { username, newPassword } = request.data || {};
  if (!username || !newPassword || newPassword.length < 6) {
    throw new HttpsError('invalid-argument', 'Username and a 6+ character password are required');
  }

  const usernameDoc = await db.collection('usernames').doc(username.trim().toLowerCase()).get();
  if (!usernameDoc.exists) {
    throw new HttpsError('not-found', 'No account with that username');
  }

  await admin.auth().updateUser(usernameDoc.data().uid, { password: newPassword });
  return { success: true };
});

// ============================================================================
// fetchClashPlayer — looks up a player's stats from the real Clash of Clans
// API. Supercell whitelists API keys by IP and Cloud Functions have no fixed
// outbound IP, so this calls a small relay (a droplet with a static IP) that
// forwards the request on to Supercell with the real key attached.
// ============================================================================
exports.fetchClashPlayer = onCall({ secrets: [CLASH_API_KEY, CLASH_RELAY_SECRET] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be signed in');
  }

  const { playerTag } = request.data || {};
  if (!playerTag || typeof playerTag !== 'string') {
    throw new HttpsError('invalid-argument', 'playerTag is required');
  }

  const cleanTag = playerTag.startsWith('#') ? playerTag.slice(1) : playerTag;
  const response = await fetch(`${CLASH_RELAY_URL}/v1/players/%23${cleanTag}`, {
    headers: {
      Authorization: `Bearer ${CLASH_API_KEY.value()}`,
      'X-Relay-Secret': CLASH_RELAY_SECRET.value(),
    },
  });

  if (!response.ok) {
    logger.warn('fetchClashPlayer: relay/API returned', response.status);
    return { found: false };
  }

  const data = await response.json();
  return {
    found: true,
    name: data.name,
    tag: data.tag,
    bestBuilderBaseTrophies: data.bestBuilderBaseTrophies || 0,
    builderBaseTrophies: data.builderBaseTrophies || 0,
    builderBaseHall: data.builderHallLevel || 0,
    townHallLevel: data.townHallLevel,
  };
});

// ============================================================================
// advanceTournaments — scheduled job, sole writer for match timeouts and
// round-advancement/champion-crowning. Runs server-side so N connected
// clients never race each other creating duplicate next-round matches.
// ============================================================================
exports.advanceTournaments = onSchedule('every 5 minutes', async () => {
  const tournamentsSnap = await db.collection('tournaments').where('status', '==', 'in_progress').get();

  for (const tournamentDoc of tournamentsSnap.docs) {
    const tournament = tournamentDoc.data();
    const matchesSnap = await tournamentDoc.ref.collection('matches').get();
    const matches = matchesSnap.docs.map((d) => d.data());

    await handleTimeouts(tournamentDoc.ref, matches);
    if (tournament.format === 'double_elimination') {
      await handleDoubleEliminationAdvancement(tournamentDoc.ref, tournament, matches);
    } else {
      await handleRoundAdvancement(tournamentDoc.ref, tournament, matches);
    }
  }
});

async function handleTimeouts(tournamentRef, matches) {
  const now = Date.now();
  const batch = db.batch();
  let hasWrites = false;

  for (const m of matches) {
    const isTimeoutEligible = ['active', 'scheduled', 'waiting_for_opponent'].includes(m.status);
    if (!isTimeoutEligible || !m.scheduledStartTime) continue;

    const elapsed = now - m.scheduledStartTime;
    if (elapsed <= TIMEOUT_MS) continue;

    const player1Reported = !!m.winner1Vote;
    const player2Reported = !!m.winner2Vote;
    const matchRef = tournamentRef.collection('matches').doc(m.id);

    if (!player1Reported && !player2Reported) {
      batch.update(matchRef, {
        status: 'needs_staff_review',
        timeoutAt: now,
        resolvedReason: 'no_report_timeout',
      });
      hasWrites = true;
    } else if (player1Reported !== player2Reported) {
      const winner = player1Reported ? m.winner1Vote : m.winner2Vote;
      batch.update(matchRef, {
        status: 'completed',
        winner,
        autoResolvedAt: now,
        resolvedReason: 'opponent_timeout',
        completedAt: now,
      });
      hasWrites = true;
    }
  }

  if (hasWrites) await batch.commit();
}

// Places the champion at #1, then groups every eliminated player by the round
// they lost in (later round = better placement), tying players from the same
// round at the same place - e.g. both semifinal losers place 3rd.
function computePlacements(champion, matches) {
  const placements = { [champion]: 1 };
  const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => b - a);

  let nextPlace = 2;
  for (const round of rounds) {
    const losers = [...new Set(
      matches
        .filter((m) => m.round === round && m.status === 'completed' && m.winner)
        .map((m) => (m.winner === m.player1 ? m.player2 : m.player1))
        .filter((p) => p && p !== 'BYE' && !(p in placements))
    )];

    if (losers.length === 0) continue;
    losers.forEach((p) => { placements[p] = nextPlace; });
    nextPlace += losers.length;
  }

  return placements;
}

async function handleRoundAdvancement(tournamentRef, tournament, matches) {
  const roundNumbers = [...new Set(matches.map((m) => m.round))];

  for (const round of roundNumbers) {
    if (round >= 10) continue;

    const roundMatches = matches.filter((m) => m.round === round);
    const allComplete = roundMatches.every((m) => TERMINAL_STATUSES.includes(m.status));
    if (!allComplete) continue;

    const nextRound = round + 1;
    const alreadyHasNextRound = matches.some((m) => m.round === nextRound);
    if (alreadyHasNextRound) continue;

    const winners = roundMatches
      .filter((m) => m.status === 'completed')
      .map((m) => m.winner)
      .filter((w) => w && !(tournament.removedPlayers || []).includes(w));

    if (winners.length === 1) {
      const placements = computePlacements(winners[0], matches);
      await tournamentRef.update({ status: 'completed', champion: winners[0], placements });
      return;
    }

    if (winners.length > 1) {
      const now = Date.now();
      const batch = db.batch();
      let matchIdx = 0;
      let i = 0;

      for (; i + 1 < winners.length; i += 2) {
        const matchId = `${tournament.id}-r${nextRound}-${matchIdx++}`;
        batch.set(tournamentRef.collection('matches').doc(matchId), {
          id: matchId,
          tournamentId: tournament.id,
          player1: winners[i],
          player2: winners[i + 1],
          player1Tag: tournament.playerStats?.[winners[i]]?.tag || '',
          player2Tag: tournament.playerStats?.[winners[i + 1]]?.tag || '',
          player1Stats: tournament.playerStats?.[winners[i]] || null,
          player2Stats: tournament.playerStats?.[winners[i + 1]] || null,
          round: nextRound,
          status: 'pending',
          player1Ready: false,
          player2Ready: false,
          player1ReadyTime: null,
          player2ReadyTime: null,
          scheduledStartTime: null,
          winner1Vote: null,
          winner2Vote: null,
          player1ScreenshotPaths: [],
          player2ScreenshotPaths: [],
        });
      }

      if (i < winners.length) {
        // Odd winner count - automatic bye into the next round.
        const matchId = `${tournament.id}-r${nextRound}-${matchIdx++}`;
        batch.set(tournamentRef.collection('matches').doc(matchId), {
          id: matchId,
          tournamentId: tournament.id,
          player1: winners[i],
          player2: 'BYE',
          player1Tag: tournament.playerStats?.[winners[i]]?.tag || '',
          player2Tag: '',
          player1Stats: tournament.playerStats?.[winners[i]] || null,
          player2Stats: null,
          round: nextRound,
          status: 'completed',
          winner: winners[i],
          completedAt: now,
          player1Ready: false,
          player2Ready: false,
          player1ReadyTime: null,
          player2ReadyTime: null,
          scheduledStartTime: null,
          winner1Vote: null,
          winner2Vote: null,
          player1ScreenshotPaths: [],
          player2ScreenshotPaths: [],
        });
      }

      await batch.commit();
    }
  }
}

// ============================================================================
// Double elimination. Every player must lose twice to be eliminated: a
// winners-bracket (WB) loss drops a player into the losers bracket (LB)
// instead of ending their run. LB rounds alternate between "drop-in" rounds
// (LB survivors face freshly-dropped WB losers) and pure consolidation
// rounds (LB survivors just play each other) - which round is which is
// fixed by round number, not by arrival order, so it stays correct even
// though WB and LB advance independently, tick by tick.
//
// WB round r's losers always feed LB round (r === 1 ? 1 : 2*(r-1)).
// LB round 2j (even) is a drop-in round; LB round 2j-1 (odd, j>1) is pure
// consolidation of LB round (2j-2)'s survivors.
// ============================================================================
function buildBracketMatchDoc({ id, tournamentId, player1, player2, round, bracket, playerStats }) {
  const now = Date.now();
  const isBye = player1 === 'BYE' || player2 === 'BYE';
  const winner = isBye ? (player1 === 'BYE' ? player2 : player1) : null;
  return {
    id,
    tournamentId,
    player1,
    player2,
    player1Tag: playerStats?.[player1]?.tag || '',
    player2Tag: playerStats?.[player2]?.tag || '',
    player1Stats: playerStats?.[player1] || null,
    player2Stats: playerStats?.[player2] || null,
    round,
    bracket,
    status: isBye ? 'completed' : 'pending',
    winner,
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
  };
}

function pairUpWithBye(players) {
  const pairs = [];
  for (let i = 0; i + 1 < players.length; i += 2) {
    pairs.push([players[i], players[i + 1]]);
  }
  if (players.length % 2 === 1) {
    pairs.push([players[players.length - 1], 'BYE']);
  }
  return pairs;
}

// Champion/runner-up from the decisive grand final match, then everyone else
// grouped by the losers-bracket round they were finally eliminated in.
function computeDoubleEliminationPlacements(matches) {
  const gfMatches = matches
    .filter((m) => m.bracket === 'grand_final' && m.status === 'completed' && m.winner)
    .sort((a, b) => b.round - a.round);
  if (gfMatches.length === 0) return {};

  const decisive = gfMatches[0];
  const champion = decisive.winner;
  const runnerUp = decisive.winner === decisive.player1 ? decisive.player2 : decisive.player1;
  const placements = { [champion]: 1, [runnerUp]: 2 };

  const lbRounds = [...new Set(matches.filter((m) => m.bracket === 'losers').map((m) => m.round))].sort((a, b) => b - a);
  let nextPlace = 3;
  for (const round of lbRounds) {
    const losers = [...new Set(
      matches
        .filter((m) => m.bracket === 'losers' && m.round === round && m.status === 'completed' && m.winner)
        .map((m) => (m.winner === m.player1 ? m.player2 : m.player1))
        .filter((p) => p && p !== 'BYE' && !(p in placements))
    )];
    if (losers.length === 0) continue;
    losers.forEach((p) => { placements[p] = nextPlace; });
    nextPlace += losers.length;
  }
  return placements;
}

async function handleDoubleEliminationAdvancement(tournamentRef, tournament, matches) {
  const bracketSize = tournament.bracketSize || 2;
  const k = Math.round(Math.log2(bracketSize));
  const totalLbRounds = Math.max(2 * (k - 1), 1);
  const playerStats = tournament.playerStats || {};
  const batch = db.batch();
  let hasWrites = false;

  const matchDocRef = (id) => tournamentRef.collection('matches').doc(id);
  const roundMatches = (bracket, round) => matches.filter((m) => m.bracket === bracket && m.round === round);
  const existsRound = (bracket, round) => roundMatches(bracket, round).length > 0;
  const roundComplete = (bracket, round) => {
    const rm = roundMatches(bracket, round);
    return rm.length > 0 && rm.every((m) => TERMINAL_STATUSES.includes(m.status));
  };
  const winnersOf = (bracket, round) =>
    roundMatches(bracket, round).filter((m) => m.status === 'completed' && m.winner).map((m) => m.winner);
  const realLosersOf = (bracket, round) =>
    roundMatches(bracket, round)
      .filter((m) => m.status === 'completed' && m.winner && m.player1 !== 'BYE' && m.player2 !== 'BYE')
      .map((m) => (m.winner === m.player1 ? m.player2 : m.player1));

  function createRound(bracket, round, players) {
    if (existsRound(bracket, round) || players.length === 0) return;
    const prefix = bracket === 'winners' ? 'wb' : bracket === 'losers' ? 'lb' : 'gf';
    pairUpWithBye(players).forEach(([p1, p2], idx) => {
      const id = `${prefix}-r${round}-${idx}`;
      batch.set(matchDocRef(id), buildBracketMatchDoc({
        id, tournamentId: tournament.id, player1: p1, player2: p2, round, bracket, playerStats,
      }));
    });
    hasWrites = true;
  }

  // --- Winners bracket: advance rounds, and drop each round's real losers
  // into their fixed losers-bracket destination as soon as it's ready. ---
  for (let r = 1; r <= k; r++) {
    if (!roundComplete('winners', r)) break;

    const winners = winnersOf('winners', r);
    const losers = realLosersOf('winners', r);

    if (r < k && !existsRound('winners', r + 1)) {
      createRound('winners', r + 1, winners);
    }

    if (losers.length > 0) {
      const targetLbRound = r === 1 ? 1 : 2 * (r - 1);
      if (!existsRound('losers', targetLbRound)) {
        if (r === 1) {
          createRound('losers', 1, losers);
        } else {
          const priorLbRound = targetLbRound - 1;
          if (roundComplete('losers', priorLbRound)) {
            const survivors = winnersOf('losers', priorLbRound);
            createRound('losers', targetLbRound, [...survivors, ...losers]);
          }
          // else: prior LB round still in progress - retry on a later tick.
        }
      }
    }
  }

  // --- Losers bracket: pure consolidation rounds (odd rounds beyond LB1)
  // only ever need the prior LB round's survivors, never new WB losers. ---
  const lbRoundNumbers = [...new Set(matches.filter((m) => m.bracket === 'losers').map((m) => m.round))].sort((a, b) => a - b);
  for (const r of lbRoundNumbers) {
    const nextRound = r + 1;
    if (nextRound > totalLbRounds) continue;
    if (nextRound % 2 === 0) continue; // even/drop-in rounds are handled above
    if (!roundComplete('losers', r) || existsRound('losers', nextRound)) continue;

    const survivors = winnersOf('losers', r);
    if (survivors.length > 1) createRound('losers', nextRound, survivors);
  }

  // --- Grand final(s) ---
  let wbChampion = null;
  if (roundComplete('winners', k)) {
    const finalWinners = winnersOf('winners', k);
    if (finalWinners.length === 1) wbChampion = finalWinners[0];
  }

  let lbChampion = null;
  if (roundComplete('losers', totalLbRounds)) {
    const finalSurvivors = winnersOf('losers', totalLbRounds);
    if (finalSurvivors.length === 1) lbChampion = finalSurvivors[0];
  }

  if (wbChampion && lbChampion && !existsRound('grand_final', 1)) {
    createRound('grand_final', 1, [wbChampion, lbChampion]);
  }

  if (tournament.status !== 'completed' && roundComplete('grand_final', 1)) {
    const gf1 = roundMatches('grand_final', 1)[0];
    if (gf1.status === 'completed' && gf1.winner === gf1.player1) {
      const placements = computeDoubleEliminationPlacements(matches);
      batch.update(tournamentRef, { status: 'completed', champion: gf1.winner, placements });
      hasWrites = true;
    } else if (gf1.status === 'completed' && !existsRound('grand_final', 2)) {
      // The losers-bracket player won game one - since both finalists now
      // have exactly one loss, a bracket-reset decider is required.
      createRound('grand_final', 2, [gf1.player1, gf1.player2]);
    }
  }

  if (tournament.status !== 'completed' && roundComplete('grand_final', 2)) {
    const gf2 = roundMatches('grand_final', 2)[0];
    if (gf2.status === 'completed' && gf2.winner) {
      const placements = computeDoubleEliminationPlacements(matches.concat(gf2));
      batch.update(tournamentRef, { status: 'completed', champion: gf2.winner, placements });
      hasWrites = true;
    }
  }

  if (hasWrites) await batch.commit();
}

// ============================================================================
// Discord notifications - fire automatically off Firestore writes, so no
// other code path needs to know about them.
// ============================================================================
exports.notifyTournamentCreated = onDocumentCreated(
  { document: 'tournaments/{tournamentId}', secrets: [DISCORD_WEBHOOK_URL] },
  async (event) => {
    const t = event.data.data();
    await notifyDiscord(`🏆 New tournament created: **${t.name}** — sign up now!`);
  }
);

exports.notifyMatchNeedsReview = onDocumentUpdated(
  { document: 'tournaments/{tournamentId}/matches/{matchId}', secrets: [DISCORD_WEBHOOK_URL] },
  async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();
    const needsReviewNow = ['disputed', 'needs_staff_review'].includes(after.status);
    const neededReviewBefore = ['disputed', 'needs_staff_review'].includes(before.status);
    if (!needsReviewNow || neededReviewBefore) return;

    await notifyDiscord(`⚠️ Match needs staff review: **${after.player1}** vs **${after.player2}**`);
  }
);

exports.notifyChampionCrowned = onDocumentUpdated(
  { document: 'tournaments/{tournamentId}', secrets: [DISCORD_WEBHOOK_URL] },
  async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();
    if (before.champion || !after.champion) return;

    await notifyDiscord(`🎉 **${after.champion}** wins **${after.name}**!`);
  }
);
