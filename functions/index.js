const crypto = require('crypto');
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { defineSecret, defineString } = require('firebase-functions/params');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const { dueReminders, discordTime } = require('./reminders');
const { nextRoundUnlockAt } = require('./schedule');
const { newOpponentMessage, chatMessage } = require('./messages');
const { generateSeededBracket, seedDoubleEliminationBracket, matchPosition } = require('./seeding');

admin.initializeApp();
const db = admin.firestore();

const STAFF_INVITE_CODE = defineSecret('STAFF_INVITE_CODE');
const CLASH_API_KEY = defineSecret('CLASH_API_KEY');
const CLASH_RELAY_SECRET = defineSecret('CLASH_RELAY_SECRET');
const DISCORD_BOT_TOKEN = defineSecret('DISCORD_BOT_TOKEN');
const DISCORD_ANNOUNCE_CHANNEL_ID = defineString('DISCORD_ANNOUNCE_CHANNEL_ID');
const DISCORD_MATCH_CHANNEL_ID = defineString('DISCORD_MATCH_CHANNEL_ID');
const DISCORD_PUBLIC_KEY = defineString('DISCORD_PUBLIC_KEY');
const SITE_URL = defineString('SITE_URL', { default: 'https://mercifulaj.com' });
const CLASH_RELAY_URL = 'https://174-138-44-50.nip.io';
const EMAIL_DOMAIN = 'clash-tournament.local';
const TIMEOUT_MS = 16 * 60 * 60 * 1000;

const DISCORD_API = 'https://discord.com/api/v10';

// Returns the parsed response on success and null on any failure, so callers
// that can fall back (DM -> channel) don't need their own try/catch.
async function discordApi(path, body) {
  try {
    const res = await fetch(`${DISCORD_API}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${DISCORD_BOT_TOKEN.value()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      logger.error('discordApi failed', { path, status: res.status, body: await res.text() });
      return null;
    }
    return await res.json();
  } catch (err) {
    logger.error('discordApi failed', err);
    return null;
  }
}

// allowed_mentions is pinned to explicit user ids so a player's chat text
// can never smuggle in an @everyone/@here or role ping.
// Every message the bot sends ends with a link back to the site, since each
// one is a prompt to go do something there (ready up, reply, claim a reward).
// The <> around the URL stops Discord adding a big preview card to each one.
function postToChannel(channelId, content, mentionIds = [], linkLabel = 'Open Rainbow League') {
  return discordApi(`/channels/${channelId}/messages`, {
    content: `${content}\n👉 [${linkLabel}](<${SITE_URL.value()}>)`,
    allowed_mentions: { parse: [], users: mentionIds },
  });
}

async function sendDm(discordId, content, linkLabel) {
  const dm = await discordApi('/users/@me/channels', { recipient_id: discordId });
  if (!dm?.id) return false;
  return !!(await postToChannel(dm.id, content, [], linkLabel));
}

// Official tournament-wide announcements: new tournaments, disputes needing
// staff, champions being crowned.
function notifyDiscord(content) {
  return postToChannel(DISCORD_ANNOUNCE_CHANNEL_ID.value(), content);
}

async function getDiscordId(username) {
  if (!username || username === 'BYE') return null;
  const usernameDoc = await db.collection('usernames').doc(username.toLowerCase()).get();
  if (!usernameDoc.exists) return null;
  const userDoc = await db.collection('users').doc(usernameDoc.data().uid).get();
  return (userDoc.exists && userDoc.data().discordId) || null;
}

// Per-player pings: DM the player when they've linked Discord, and fall back
// to an @mention in the match channel when they haven't or their DMs are
// closed, so a missed DM never means a missed attack.
async function notifyPlayer(username, content, linkLabel) {
  if (!username || username === 'BYE') return;
  const discordId = await getDiscordId(username);
  if (discordId && (await sendDm(discordId, content, linkLabel))) return;
  const prefix = discordId ? `<@${discordId}>` : `**${username}**`;
  await postToChannel(DISCORD_MATCH_CHANNEL_ID.value(), `${prefix} ${content}`, discordId ? [discordId] : [], linkLabel);
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
  try {
    return await fetch(`${CLASH_RELAY_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${CLASH_API_KEY.value()}`,
        'X-Relay-Secret': CLASH_RELAY_SECRET.value(),
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });
  } catch (err) {
    // The relay box being unreachable (down, rebooting, DNS hiccup) is an
    // infra problem, not the caller's fault - surface a clean, actionable
    // error instead of letting the raw network exception bubble up as a
    // generic "INTERNAL" the client can't do anything useful with.
    logger.error('callClashApi: relay unreachable', err);
    throw new HttpsError('unavailable', 'Clash of Clans verification is temporarily unavailable. Please try again in a few minutes.');
  }
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
  // The username becomes the local part of a synthesized email
  // (user@clash-tournament.local) for Firebase Auth, so it has to be
  // restricted to characters that are actually valid there - otherwise
  // account creation fails deep inside admin.auth().createUser() with an
  // opaque "email address is improperly formatted" error.
  if (!/^[A-Za-z0-9_.-]+$/.test(username.trim())) {
    throw new HttpsError('invalid-argument', 'Username may only contain letters, numbers, underscores, hyphens, and periods');
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
  const response = await callClashApi(`/v1/players/%23${cleanTag}`);

  if (!response.ok) {
    logger.warn('fetchClashPlayer: relay/API returned', response.status);
    return { found: false };
  }

  const data = await response.json();
  // Only Builder Base fields count here - legendStatistics.bestSeason is the
  // home-village Legend League season, which isn't what this stat is for.
  // Supercell only sends a Builder Base best season for some players, so a
  // missing one just means there's nothing to show.
  const bestSeason = data.legendStatistics?.bestBuilderBaseSeason || data.legendStatistics?.bestVersusSeason || null;
  return {
    found: true,
    name: data.name,
    tag: data.tag,
    bestBuilderBaseTrophies: data.bestBuilderBaseTrophies || 0,
    builderBaseTrophies: data.builderBaseTrophies || 0,
    builderBaseHall: data.builderHallLevel || 0,
    townHallLevel: data.townHallLevel,
    builderBaseLeague: data.builderBaseLeague?.name || null,
    clanName: data.clan?.name || null,
    clanBadgeUrl: data.clan?.badgeUrls?.small || null,
    versusBattleWins: data.versusBattleWinCount ?? null,
    bestSeasonRank: bestSeason?.rank ?? null,
    bestSeasonId: bestSeason?.id || null,
    bestSeasonTrophies: bestSeason?.trophies ?? null,
  };
});

// ============================================================================
// fetchLocalRanking — where a player currently ranks in their country's
// Builder Base leaderboard. The player API has no "country" field, so the
// caller supplies the location id the player picked on their own profile.
// The rankings endpoint only returns the top 200 for a location, so anyone
// outside that range simply isn't in the list - there's no exact rank to
// give them beyond "outside the top 200".
// ============================================================================
exports.fetchLocalRanking = onCall({ secrets: [CLASH_API_KEY, CLASH_RELAY_SECRET] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be signed in');
  }

  const { playerTag, locationId } = request.data || {};
  if (!playerTag || typeof playerTag !== 'string' || !locationId) {
    throw new HttpsError('invalid-argument', 'playerTag and locationId are required');
  }

  const cleanTag = `#${playerTag.replace(/^#/, '').toUpperCase()}`;
  const response = await callClashApi(`/v1/locations/${locationId}/rankings/players-builder-base?limit=200`);

  if (!response.ok) {
    logger.warn('fetchLocalRanking: relay/API returned', response.status);
    return { found: false };
  }

  const data = await response.json();
  const entry = (data.items || []).find((p) => p.tag === cleanTag);
  return { found: true, rank: entry ? entry.rank : null, checkedTop: 200 };
});

// ============================================================================
// advanceTournaments — scheduled job, sole writer for match timeouts and
// round-advancement/champion-crowning. Runs server-side so N connected
// clients never race each other creating duplicate next-round matches.
// ============================================================================
exports.advanceTournaments = onSchedule({ schedule: 'every 5 minutes', secrets: [DISCORD_BOT_TOKEN] }, async () => {
  const now = Date.now();
  const openSnap = await db.collection('tournaments').where('status', '==', 'signups_open').get();
  for (const tournamentDoc of openSnap.docs) {
    const tournament = tournamentDoc.data();
    // Only trust a deadline stored as an unambiguous UTC instant (always
    // ends in 'Z' - the format createTournament writes today). A tournament
    // created before that fix may still hold a bare "YYYY-MM-DDTHH:mm"
    // string with no timezone; parsing that here (this process runs in
    // UTC) doesn't reflect the creator's actual local time and once made a
    // real tournament auto-start hours early. Leave those for staff to
    // start manually (or re-save the deadline) until it's in the new form.
    const deadline = tournament.signupDeadline;
    if (typeof deadline === 'string' && deadline.endsWith('Z') && new Date(deadline).getTime() <= now) {
      await autoStartTournament(tournamentDoc.ref, tournament);
    }
  }

  const tournamentsSnap = await db.collection('tournaments').where('status', '==', 'in_progress').get();

  for (const tournamentDoc of tournamentsSnap.docs) {
    const tournament = tournamentDoc.data();
    const matchesSnap = await tournamentDoc.ref.collection('matches').get();
    const matches = matchesSnap.docs.map((d) => d.data());

    await handleTimeouts(tournamentDoc.ref, tournament, matches);
    await sendMatchReminders(tournamentDoc.ref, matches);
    if (tournament.format === 'double_elimination') {
      await handleDoubleEliminationAdvancement(tournamentDoc.ref, tournament, matches);
    } else {
      await handleRoundAdvancement(tournamentDoc.ref, tournament, matches);
    }
  }
});

// Marks each reminder on the match before sending it, so a failure partway
// through can at worst skip a reminder rather than repeat one every 5 minutes.
async function sendMatchReminders(tournamentRef, matches) {
  const now = Date.now();
  for (const m of matches) {
    for (const reminder of dueReminders(m, now)) {
      try {
        await tournamentRef.collection('matches').doc(m.id).update({ [`remindersSent.${reminder.key}`]: true });
        await Promise.all(reminder.recipients.map((name) => notifyPlayer(name, reminder.text, reminder.linkLabel)));
      } catch (err) {
        logger.error('sendMatchReminders failed', { matchId: m.id, key: reminder.key, err });
      }
    }
  }
}

// ============================================================================
// Auto-start — once a tournament's signup deadline passes, seed and start it
// without staff needing to click anything. Bracket size and match count fall
// out automatically from however many players actually signed up.
//
// Seeding lives in ./seeding.js, which mirrors generateSeededBracket/
// seedDoubleEliminationBracket in tournament/src/utils.js - duplicated because
// Cloud Functions (CommonJS) can't share an ES module with the CRA client
// without ejecting the build. Keep the two in sync if either changes.
// ============================================================================
// Looks up each player's last-verified Clash tag/trophies from their profile
// (not a fresh API call) - good enough for seeding purposes and keeps a
// scheduled job from depending on the external Clash relay to start a
// tournament.
async function lookupPlayerStats(usernames) {
  const stats = {};
  for (let i = 0; i < usernames.length; i += 30) {
    const chunk = usernames.slice(i, i + 30).map((u) => u.toLowerCase());
    const snap = await db.collection('users').where('usernameLower', 'in', chunk).get();
    snap.docs.forEach((d) => {
      const data = d.data();
      stats[data.username] = { tag: data.clashTag || '', bestBuilderBaseTrophies: data.bestBuilderBaseTrophies || 0 };
    });
  }
  return stats;
}

function newMatchDoc({ id, tournamentId, player1, player2, round, bracket, playerStats, now, unlockAt = now }) {
  const isBye = player2 === 'BYE';
  return {
    id,
    tournamentId,
    player1,
    player2,
    player1Tag: playerStats[player1]?.tag || '',
    player2Tag: playerStats[player2]?.tag || '',
    player1Stats: playerStats[player1] || null,
    player2Stats: playerStats[player2] || null,
    round,
    unlockAt,
    ...(bracket ? { bracket } : {}),
    status: isBye ? 'completed' : 'pending',
    winner: isBye ? player1 : null,
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

async function autoStartTournament(tournamentRef, tournament) {
  const players = tournament.players || [];
  // Fewer than 2 signups means there's no tournament to run - leave it open
  // for staff to delete or otherwise decide rather than crashing on a
  // degenerate 1-player bracket.
  if (players.length < 2) return;

  const playerStats = await lookupPlayerStats(players);
  const now = Date.now();
  const batch = db.batch();
  const isDoubleElim = tournament.format === 'double_elimination';

  if (isDoubleElim) {
    const { pairs, bracketSize } = seedDoubleEliminationBracket(players, playerStats);
    pairs.forEach(([p1, p2], idx) => {
      const id = `wb-r1-${idx}`;
      batch.set(tournamentRef.collection('matches').doc(id), newMatchDoc({
        id, tournamentId: tournament.id, player1: p1, player2: p2, round: 1, bracket: 'winners', playerStats, now,
      }));
    });
    batch.update(tournamentRef, { status: 'in_progress', startedAt: now, bracketSize, playerStats });
  } else {
    const bracket = generateSeededBracket(players, playerStats);
    bracket.forEach(([p1, p2], idx) => {
      const id = `${tournament.id}-${idx}`;
      batch.set(tournamentRef.collection('matches').doc(id), newMatchDoc({
        id, tournamentId: tournament.id, player1: p1, player2: p2, round: 1, playerStats, now,
      }));
    });
    batch.update(tournamentRef, {
      status: 'in_progress',
      startedAt: now,
      bracket: bracket.map(([player1, player2]) => ({ player1, player2 })),
      playerStats,
    });
  }

  await batch.commit();
}

async function handleTimeouts(tournamentRef, tournament, matches) {
  const now = Date.now();
  const batch = db.batch();
  let hasWrites = false;
  const disqualified = [];
  const newlyGraced = [];
  const gracedPlayers = tournament.gracedPlayers || [];

  for (const m of matches) {
    const matchRef = tournamentRef.collection('matches').doc(m.id);

    // One player readied up, the other never did - after the same timeout
    // used everywhere else, the ready player wins by forfeit rather than
    // waiting forever on an opponent who may not show up at all.
    if (m.status === 'pending' && m.player1Ready !== m.player2Ready) {
      const readyTime = m.player1Ready ? m.player1ReadyTime : m.player2ReadyTime;
      if (readyTime && now - readyTime > TIMEOUT_MS) {
        const winner = m.player1Ready ? m.player1 : m.player2;
        batch.update(matchRef, {
          status: 'completed',
          winner,
          autoResolvedAt: now,
          resolvedReason: 'opponent_no_show',
          completedAt: now,
        });
        hasWrites = true;
      }
      continue;
    }

    const isTimeoutEligible = ['active', 'scheduled', 'waiting_for_opponent'].includes(m.status);
    if (!isTimeoutEligible || !m.scheduledStartTime) continue;

    const elapsed = now - m.scheduledStartTime;
    if (elapsed <= TIMEOUT_MS) continue;

    const player1Reported = !!m.winner1Vote;
    const player2Reported = !!m.winner2Vote;

    if (!player1Reported && !player2Reported) {
      // Both readied up but neither ever reported a result. First time this
      // happens to either of them in this tournament, give them a one-day
      // grace: both advance (no winner, but neither is eliminated either -
      // handleRoundAdvancement/handleDoubleEliminationAdvancement treat a
      // grace_period match as producing BOTH players as advancers instead
      // of the usual one). If either has already used their grace, staff
      // has to sort it out instead of it repeating indefinitely.
      const alreadyGraced = gracedPlayers.includes(m.player1) || gracedPlayers.includes(m.player2);
      if (alreadyGraced) {
        batch.update(matchRef, {
          status: 'needs_staff_review',
          timeoutAt: now,
          resolvedReason: 'no_report_timeout_repeat',
        });
      } else {
        batch.update(matchRef, {
          status: 'completed',
          winner: null,
          autoResolvedAt: now,
          resolvedReason: 'grace_period',
          completedAt: now,
        });
        newlyGraced.push(m.player1, m.player2);
      }
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

  // Combined into one update - a batch can only hold one write per document.
  if (disqualified.length > 0 || newlyGraced.length > 0) {
    const tournamentUpdate = {};
    if (disqualified.length > 0) {
      const uniqueDisqualified = [...new Set(disqualified)];
      tournamentUpdate.players = admin.firestore.FieldValue.arrayRemove(...uniqueDisqualified);
      tournamentUpdate.removedPlayers = admin.firestore.FieldValue.arrayUnion(...uniqueDisqualified);
    }
    if (newlyGraced.length > 0) {
      tournamentUpdate.gracedPlayers = admin.firestore.FieldValue.arrayUnion(...new Set(newlyGraced));
    }
    batch.update(tournamentRef, tournamentUpdate);
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

    // Bracket position, not document-id order - see matchPosition.
    const roundMatches = matches.filter((m) => m.round === round).sort((a, b) => matchPosition(a) - matchPosition(b));
    // 'disputed'/'needs_staff_review' are terminal in the sense that no
    // more player action is expected, but they don't have a real winner
    // yet - advancing (or crowning a champion) while one is still open
    // would silently ignore it and could end the tournament on a false
    // champion the moment every OTHER match in the round is done.
    const allDecided = roundMatches.every((m) => m.status === 'completed');
    if (!allDecided) continue;

    const nextRound = round + 1;
    const alreadyHasNextRound = matches.some((m) => m.round === nextRound);
    if (alreadyHasNextRound) continue;

    // A grace_period match (see handleTimeouts) has no winner but both
    // players still advance, unlike every other resolution which produces
    // exactly one.
    const winners = roundMatches
      .filter((m) => m.status === 'completed')
      .flatMap((m) => (m.resolvedReason === 'grace_period' ? [m.player1, m.player2] : [m.winner]))
      .filter((w) => w && !(tournament.removedPlayers || []).includes(w));

    if (winners.length === 1) {
      const placements = computePlacements(winners[0], matches);
      await tournamentRef.update({ status: 'completed', champion: winners[0], placements });
      return;
    }

    if (winners.length > 1) {
      const now = Date.now();
      const roundUnlockAt = nextRoundUnlockAt(matches, now);
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
          unlockAt: roundUnlockAt,
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
          unlockAt: roundUnlockAt,
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
function buildBracketMatchDoc({ id, tournamentId, player1, player2, round, day, unlockAt, bracket, playerStats }) {
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
    day,
    unlockAt,
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
  // Bracket position, not document-id order - see matchPosition.
  const roundMatches = (bracket, round) => matches
    .filter((m) => m.bracket === bracket && m.round === round)
    .sort((a, b) => matchPosition(a) - matchPosition(b));
  const existsRound = (bracket, round) => roundMatches(bracket, round).length > 0;
  // 'disputed'/'needs_staff_review' are terminal in the sense that no more
  // player action is expected, but they don't have a real winner yet -
  // treating a round as ready to advance while one is still open would
  // silently ignore it (and, worse, could crown a false champion the
  // moment every OTHER match in the round happens to be decided).
  const roundComplete = (bracket, round) => {
    const rm = roundMatches(bracket, round);
    return rm.length > 0 && rm.every((m) => m.status === 'completed');
  };
  // A grace_period match (see handleTimeouts) has no winner but both
  // players still advance, unlike every other resolution which produces
  // exactly one.
  const winnersOf = (bracket, round) =>
    roundMatches(bracket, round)
      .filter((m) => m.status === 'completed' && (m.winner || m.resolvedReason === 'grace_period'))
      .flatMap((m) => (m.resolvedReason === 'grace_period' ? [m.player1, m.player2] : [m.winner]));
  const realLosersOf = (bracket, round) =>
    roundMatches(bracket, round)
      .filter((m) => m.status === 'completed' && m.winner && m.player1 !== 'BYE' && m.player2 !== 'BYE')
      .map((m) => (m.winner === m.player1 ? m.player2 : m.player1));

  // `day` is a cosmetic sequential label ("Day N") - it does NOT gate
  // anything. Gating is `unlockAt`: each day opens 24h after the latest one
  // opened (see nextRoundUnlockAt), or straight away if the rounds before it
  // overran, so every day is a real 24h window. Computed once per pass so
  // every round created together opens together.
  const unlockAt = nextRoundUnlockAt(matches);
  function createRound(bracket, round, players, day = round) {
    if (existsRound(bracket, round) || players.length === 0) return;
    const prefix = bracket === 'winners' ? 'wb' : bracket === 'losers' ? 'lb' : 'gf';
    pairUpWithBye(players).forEach(([p1, p2], idx) => {
      const id = `${prefix}-r${round}-${idx}`;
      batch.set(matchDocRef(id), buildBracketMatchDoc({
        id, tournamentId: tournament.id, player1: p1, player2: p2, round, day, unlockAt, bracket, playerStats,
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
    createRound('grand_final', 1, [wbChampion, lbChampion], totalLbRounds + 1);
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
      createRound('grand_final', 2, [gf1.player1, gf1.player2], totalLbRounds + 2);
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
  { document: 'tournaments/{tournamentId}', secrets: [DISCORD_BOT_TOKEN] },
  async (event) => {
    const t = event.data.data();
    await notifyDiscord(`🏆 New tournament created: **${t.name}** — sign up now!`);
  }
);

exports.notifyMatchNeedsReview = onDocumentUpdated(
  { document: 'tournaments/{tournamentId}/matches/{matchId}', secrets: [DISCORD_BOT_TOKEN] },
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
  { document: 'tournaments/{tournamentId}', secrets: [DISCORD_BOT_TOKEN] },
  async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();
    if (before.champion || !after.champion) return;

    await notifyDiscord(`🎉 **${after.champion}** wins **${after.name}**!`);
  }
);

exports.notifyMatchReady = onDocumentCreated(
  { document: 'tournaments/{tournamentId}/matches/{matchId}', secrets: [DISCORD_BOT_TOKEN] },
  async (event) => {
    const m = event.data.data();
    if (!m.player1 || !m.player2 || m.player1 === 'BYE' || m.player2 === 'BYE') return;

    const alreadyOpen = !m.unlockAt || m.unlockAt <= Date.now();
    // This message already told them it's live; skip the separate unlock ping.
    if (alreadyOpen) await event.data.ref.update({ 'remindersSent.unlock': true });
    // Each player gets a message about *their* opponent (see messages.js);
    // later rounds are created a day before they open, so it says when.
    await Promise.all([m.player1, m.player2].map((player) => {
      const { text, linkLabel } = newOpponentMessage(m, player);
      return notifyPlayer(player, text, linkLabel);
    }));
  }
);

exports.notifyNewChatMessage = onDocumentCreated(
  { document: 'tournaments/{tournamentId}/matches/{matchId}/messages/{messageId}', secrets: [DISCORD_BOT_TOKEN] },
  async (event) => {
    const msg = event.data.data();
    const { tournamentId, matchId } = event.params;

    const matchDoc = await db.collection('tournaments').doc(tournamentId).collection('matches').doc(matchId).get();
    if (!matchDoc.exists) return;
    const match = matchDoc.data();

    const recipient = match.player1 === msg.sender ? match.player2 : match.player1;
    if (!recipient || recipient === 'BYE') return;

    const { text, linkLabel } = chatMessage(match, msg.sender, msg.text);
    await notifyPlayer(recipient, text, linkLabel);
  }
);

// ============================================================================
// Discord account linking - the player asks for a one-time code while signed
// in to the app, then redeems it with /link in Discord. Needing both sides
// proves the same person owns the tournament account and the Discord account,
// which typing a User ID into a profile field never did.
// ============================================================================
const LINK_CODE_TTL_MS = 10 * 60 * 1000;
// No 0/O/1/I so a code read off the screen can't be mistyped.
const LINK_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateLinkCode() {
  let code = '';
  for (let i = 0; i < 6; i++) code += LINK_CODE_ALPHABET[crypto.randomInt(LINK_CODE_ALPHABET.length)];
  return code;
}

exports.createDiscordLinkCode = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  const uid = request.auth.uid;

  // One live code per player, so old ones don't pile up.
  const stale = await db.collection('discordLinkCodes').where('uid', '==', uid).get();
  const batch = db.batch();
  stale.docs.forEach((d) => batch.delete(d.ref));

  const code = generateLinkCode();
  const expiresAt = Date.now() + LINK_CODE_TTL_MS;
  batch.set(db.collection('discordLinkCodes').doc(code), { uid, expiresAt });
  await batch.commit();
  return { code, expiresAt };
});

// Ed25519 public keys wrapped in the fixed SPKI header Node's crypto expects.
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

function verifyDiscordSignature(req) {
  const signature = req.get('X-Signature-Ed25519');
  const timestamp = req.get('X-Signature-Timestamp');
  if (!signature || !timestamp || !req.rawBody) return false;
  try {
    const key = crypto.createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(DISCORD_PUBLIC_KEY.value(), 'hex')]),
      format: 'der',
      type: 'spki',
    });
    return crypto.verify(null, Buffer.concat([Buffer.from(timestamp), req.rawBody]), key, Buffer.from(signature, 'hex'));
  } catch (err) {
    return false;
  }
}

// Only the invoking player sees these (flags: 64 = ephemeral).
function ephemeralReply(content) {
  return { type: 4, data: { content, flags: 64 } };
}

async function redeemLinkCode(rawCode, discordId) {
  const code = String(rawCode || '').trim().toUpperCase();
  const codeRef = db.collection('discordLinkCodes').doc(code || '_');
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(codeRef);
    if (!snap.exists) {
      logger.info('link redeem: code not found', { code });
      return 'That code isn\'t valid. Get a fresh one from your profile in the app.';
    }
    const { uid, expiresAt } = snap.data();
    tx.delete(codeRef);
    if (Date.now() > expiresAt) {
      logger.info('link redeem: code expired', { code, uid });
      return 'That code has expired. Get a fresh one from your profile in the app.';
    }
    tx.update(db.collection('users').doc(uid), { discordId: discordId });
    logger.info('link redeem: linked', { uid, discordId });
    return '✅ Linked! You\'ll now get your match reminders and chat messages here by DM.';
  });
}

exports.discordInteractions = onRequest(async (req, res) => {
  if (req.method !== 'POST' || !verifyDiscordSignature(req)) {
    res.status(401).send('invalid request signature');
    return;
  }

  const interaction = req.body;
  if (interaction.type === 1) { // PING - Discord checks the endpoint with this
    res.json({ type: 1 });
    return;
  }

  if (interaction.type === 2 && interaction.data?.name === 'link') {
    const discordId = interaction.member?.user?.id || interaction.user?.id;
    const codeOption = interaction.data.options?.find((o) => o.name === 'code');
    try {
      res.json(ephemeralReply(await redeemLinkCode(codeOption?.value, discordId)));
    } catch (err) {
      logger.error('link redeem failed', err);
      res.json(ephemeralReply('Something went wrong linking your account. Try again in a moment.'));
    }
    return;
  }

  res.json(ephemeralReply('Unknown command.'));
});

// ============================================================================
// Reward links - staff hand each of the top finishers a one-time link (the
// prize itself). Links are recorded on the tournament so each player can see
// only their own in the app, and DMed by the bot. A link must never reach a
// public channel, so when a DM can't be delivered the channel only gets a
// nudge to check the app, never the link.
// ============================================================================
function ordinalSuffix(n) {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'}`;
}

exports.dispenseRewards = onCall({ secrets: [DISCORD_BOT_TOKEN] }, async (request) => {
  if (!request.auth?.token?.isStaff) throw new HttpsError('permission-denied', 'Only staff can dispense rewards');

  const { tournamentId, rewards } = request.data || {};
  if (!tournamentId || !Array.isArray(rewards) || rewards.length === 0) {
    throw new HttpsError('invalid-argument', 'Pick at least one player and give them a reward link');
  }
  if (rewards.length > 200) throw new HttpsError('invalid-argument', 'Too many rewards in one go');

  const tournamentRef = db.collection('tournaments').doc(String(tournamentId));
  const tournamentSnap = await tournamentRef.get();
  if (!tournamentSnap.exists) throw new HttpsError('not-found', 'Tournament not found');
  const tournament = tournamentSnap.data();
  if (tournament.status !== 'completed') throw new HttpsError('failed-precondition', 'Rewards can only be dispensed once the tournament is complete');

  const placements = tournament.placements || {};
  const rewardsRef = tournamentRef.collection('rewards');
  const existing = await rewardsRef.get();
  const alreadyRewarded = new Set(existing.docs.map((d) => d.id));
  const usedLinks = new Set(existing.docs.map((d) => d.data().link));

  const seenPlayers = new Set();
  const seenLinks = new Set();
  const clean = rewards.map((r) => {
    const username = String(r?.username || '').trim();
    const link = String(r?.link || '').trim();
    const key = username.toLowerCase();
    if (!username || !(username in placements)) throw new HttpsError('invalid-argument', `${username || 'A player'} didn't place in this tournament`);
    if (!/^https?:\/\/\S+$/i.test(link)) throw new HttpsError('invalid-argument', `That doesn't look like a link: ${link.slice(0, 60)}`);
    if (seenPlayers.has(key)) throw new HttpsError('invalid-argument', `${username} is listed twice`);
    if (seenLinks.has(link) || usedLinks.has(link)) throw new HttpsError('invalid-argument', 'A link is used more than once');
    if (alreadyRewarded.has(key)) throw new HttpsError('failed-precondition', `${username} already has a reward`);
    seenPlayers.add(key);
    seenLinks.add(link);
    return { username, key, link, place: placements[username] };
  });

  const now = Date.now();
  const batch = db.batch();
  clean.forEach((r) => {
    batch.set(rewardsRef.doc(r.key), {
      username: r.username,
      link: r.link,
      place: r.place,
      sentAt: now,
      sentBy: request.auth.token.username || null,
      delivery: 'pending',
    });
  });
  await batch.commit();

  const results = [];
  for (const r of clean) {
    let delivery = 'app_only';
    try {
      const discordId = await getDiscordId(r.username);
      const dmSent = discordId && (await sendDm(
        discordId,
        `🎁 Congratulations on finishing ${ordinalSuffix(r.place)} in **${tournament.name}**! Here's your reward link. It only works once, so don't share it:\n${r.link}`
      ));
      if (dmSent) {
        delivery = 'dm_sent';
      } else {
        const prefix = discordId ? `<@${discordId}>` : `**${r.username}**`;
        await postToChannel(
          DISCORD_MATCH_CHANNEL_ID.value(),
          `${prefix} 🎁 You have a reward waiting for **${tournament.name}**. Open the app to claim it.`,
          discordId ? [discordId] : []
        );
      }
    } catch (err) {
      logger.error('dispenseRewards notify failed', { username: r.username, err });
    }
    await rewardsRef.doc(r.key).update({ delivery });
    results.push({ username: r.username, delivery });
  }
  return { results };
});
