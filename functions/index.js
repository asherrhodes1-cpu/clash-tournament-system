const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

const STAFF_INVITE_CODE = defineSecret('STAFF_INVITE_CODE');
const EMAIL_DOMAIN = 'clash-tournament.local';
const TIMEOUT_MS = 16 * 60 * 60 * 1000;
const TERMINAL_STATUSES = ['completed', 'disputed', 'needs_staff_review'];

function usernameToEmail(username) {
  return `${username.trim().toLowerCase()}@${EMAIL_DOMAIN}`;
}

// ============================================================================
// signUp — creates an account. If a valid invite code is supplied, the account
// is marked staff. The invite code itself never reaches the client bundle.
// ============================================================================
exports.signUp = onCall({ secrets: [STAFF_INVITE_CODE] }, async (request) => {
  const { username, password, clashTag, inviteCode } = request.data || {};

  if (!username || typeof username !== 'string' || username.trim().length < 3) {
    throw new HttpsError('invalid-argument', 'Username must be at least 3 characters');
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    throw new HttpsError('invalid-argument', 'Password must be at least 6 characters');
  }
  if (!clashTag || typeof clashTag !== 'string' || !clashTag.startsWith('#')) {
    throw new HttpsError('invalid-argument', 'Clash tag must start with #');
  }

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
      clashTag: clashTag.toUpperCase(),
      isStaff,
      createdAt: new Date().toISOString(),
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
    await handleRoundAdvancement(tournamentDoc.ref, tournament, matches);
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
          player1ScreenshotPath: null,
          player2ScreenshotPath: null,
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
          player1ScreenshotPath: null,
          player2ScreenshotPath: null,
        });
      }

      await batch.commit();
    }
  }
}
