const crypto = require('crypto');
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { defineSecret, defineString } = require('firebase-functions/params');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const { dueReminders, discordTime, matchDayEnd } = require('./reminders');
const { nextRoundUnlockAt } = require('./schedule');
const { newOpponentMessage, chatMessage, opponentReadyMessage, sentToStaffMessage } = require('./messages');
const { fetchWithRetry, fetchTransientRetry } = require('./http');
const { addGuildRole } = require('./roles');
const { generateSeededBracket, seedDoubleEliminationBracket, matchPosition } = require('./seeding');
const { planSingleElimAdvancement } = require('./advancement');
const { planDoubleElimAdvancement } = require('./doubleElim');
const { planScoreChanges, tallyScores } = require('./predictions');
const { readyUpDeadline, playDeadline } = require('./reminders');
const { STARTING_GEMS, ROUND_KINDS, kindOf, planBet, payoutFor, bettingIsOpen } = require('./betting');
const { POCKET_COUNT, POCKETS, checkSpin, spinPayout } = require('./roulette');
const { VOTING_MS, planDonation, pickOptions, votingIsOpen } = require('./challenges');
const { dropIsOpen } = require('./drops');
const { checkNewUsername, renameChanges } = require('./rename');
const {
  MAX_LIVES, LIFE_WINDOW_MS, attackCostsLife, loseLife, buyLife, windowIsOpen, windowHasExpired,
} = require('./lives');
const { LADDER_ID, LADDER_MATCH_MS, START_RATING, outcomeOf, rateMatch, pickOpponent, pairQueue } = require('./ladder');

admin.initializeApp();
const db = admin.firestore();

const STAFF_INVITE_CODE = defineSecret('STAFF_INVITE_CODE');
const CLASH_API_KEY = defineSecret('CLASH_API_KEY');
const CLASH_RELAY_SECRET = defineSecret('CLASH_RELAY_SECRET');
const DISCORD_BOT_TOKEN = defineSecret('DISCORD_BOT_TOKEN');
const DISCORD_ANNOUNCE_CHANNEL_ID = defineString('DISCORD_ANNOUNCE_CHANNEL_ID');
const DISCORD_MATCH_CHANNEL_ID = defineString('DISCORD_MATCH_CHANNEL_ID');
const DISCORD_PUBLIC_KEY = defineString('DISCORD_PUBLIC_KEY');
// Read straight from the environment (functions load .env files into it), not
// as a deploy param: a param makes every deploy stop and ask for a value, and
// a wrong answer at that prompt once put a shell command in the bot's links.
// Anything that isn't a plain http(s) address falls back to the real site.
const DEFAULT_SITE_URL = 'https://mercifulaj.com';
function siteUrl() {
  const configured = (process.env.SITE_URL || '').trim();
  return /^https?:\/\/[^\s<>()]+$/i.test(configured) ? configured : DEFAULT_SITE_URL;
}
const CLASH_RELAY_URL = 'https://174-138-44-50.nip.io';
const EMAIL_DOMAIN = 'clash-tournament.local';

const DISCORD_API = 'https://discord.com/api/v10';

// Returns the parsed response on success and null on any failure, so callers
// that can fall back (DM -> channel) don't need their own try/catch.
async function discordApi(path, body) {
  try {
    const res = await fetchWithRetry(`${DISCORD_API}${path}`, {
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
function postToChannel(channelId, content, mentionIds = [], linkLabel = 'Open Builder League') {
  return discordApi(`/channels/${channelId}/messages`, {
    content: `${content}\n👉 [${linkLabel}](<${siteUrl()}>)`,
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
// Optional: a channel webhook for players who haven't linked Discord. It's a
// separate route with its own rate limit from the bot's channel posts, and it
// keeps working even if the bot loses access to the channel. Read from the
// environment (functions/.env), not a deploy param, so deploys never stop to
// ask for it. Anything that isn't a Discord webhook address is ignored.
function matchWebhookUrl() {
  const url = (process.env.DISCORD_MATCH_WEBHOOK_URL || '').trim();
  return /^https:\/\/(discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(url) ? url : null;
}

async function postToMatchWebhook(url, content, linkLabel = 'Open Builder League') {
  try {
    const res = await fetchWithRetry(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: `${content}\n👉 [${linkLabel}](<${siteUrl()}>)`,
        allowed_mentions: { parse: [] },
      }),
    });
    if (!res.ok) logger.error('match webhook failed', { status: res.status, body: await res.text() });
    return res.ok;
  } catch (err) {
    logger.error('match webhook failed', err);
    return false;
  }
}

async function notifyPlayer(username, content, linkLabel) {
  if (!username || username === 'BYE') return;
  const discordId = await getDiscordId(username);
  if (discordId && (await sendDm(discordId, content, linkLabel))) return;

  // Not linked (or DMs closed): a public notice in the match channel. Someone
  // who isn't linked can't be pinged, so it names them in bold instead.
  const webhook = !discordId && matchWebhookUrl();
  if (webhook && (await postToMatchWebhook(webhook, `**${username}** ${content}`, linkLabel))) return;
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
    return await fetchTransientRetry(`${CLASH_RELAY_URL}${path}`, {
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
    // A rate limit or an outage on their side says nothing about the tag, so
    // don't tell the player to go and double check it.
    if (verifyResp.status === 429 || verifyResp.status >= 500) {
      logger.error('verifyAndFetchClashPlayer: token check failed', { tag: cleanTag, status: verifyResp.status });
      throw new HttpsError('unavailable', 'Clash of Clans is temporarily unavailable. Please try again in a minute.');
    }
    throw new HttpsError('invalid-argument', 'Could not verify that Clash of Clans tag - double check it and try again.');
  }
  const verifyData = await verifyResp.json();
  if (verifyData.status !== 'ok') {
    throw new HttpsError('invalid-argument', 'That API token does not match the given player tag.');
  }

  const playerResp = await callClashApi(`/v1/players/%23${cleanTag}`);
  if (!playerResp.ok) {
    // Keep what Clash of Clans actually said - without it a failure here can't
    // be told apart (rate limit, maintenance, a bad tag...) after the fact.
    logger.error('verifyAndFetchClashPlayer: player lookup failed', {
      tag: cleanTag,
      status: playerResp.status,
      body: (await playerResp.text().catch(() => '')).slice(0, 300),
    });
    throw new HttpsError('unavailable', 'Your account was verified, but Clash of Clans didn\'t return your player stats. This is usually temporary - please try again in a minute.');
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
// The tag and token are optional as a pair: the Live section signs people up
// with just a username and password so they can vote in stream polls. Those
// accounts stay unverified until they verify from their profile, which
// joining a tournament requires (see firestore.rules).
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
  const withClash = !!clashTag || !!apiToken;
  let cleanTag = '';
  let clashStats = null;
  if (withClash) {
    if (!clashTag || typeof clashTag !== 'string' || !clashTag.startsWith('#')) {
      throw new HttpsError('invalid-argument', 'Clash tag must start with #');
    }
    if (!apiToken || typeof apiToken !== 'string' || apiToken.trim().length < 5) {
      throw new HttpsError('invalid-argument', 'Your Clash of Clans API token is required');
    }
    cleanTag = clashTag.trim().toUpperCase().replace(/^#/, '');
    clashStats = await verifyAndFetchClashPlayer(cleanTag, apiToken.trim());
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
      clashTag: withClash ? `#${cleanTag}` : '',
      isStaff,
      createdAt: new Date().toISOString(),
      clashVerified: withClash,
      ...(withClash && {
        builderHallLevel: clashStats.builderHallLevel,
        bestBuilderBaseTrophies: clashStats.bestBuilderBaseTrophies,
      }),
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
// removeUser — staff-only. Deletes an account outright, for usernames staff
// judge inappropriate: the login, the profile, and the name everywhere it
// would still be shown (Gold leaderboard, 1v1 leaderboard and queue, the
// roulette feed, signups for tournaments that haven't started). The name
// stays reserved so it can't simply be registered again. Staff accounts
// can't be removed this way. Each removal is logged in removedUsers.
// ============================================================================
exports.removeUser = onCall(async (request) => {
  if (!request.auth?.token?.isStaff) throw new HttpsError('permission-denied', 'Staff only');
  const { uid } = request.data || {};
  if (!uid || typeof uid !== 'string') throw new HttpsError('invalid-argument', 'Missing user');
  if (uid === request.auth.uid) throw new HttpsError('failed-precondition', 'You can\'t remove your own account');

  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) throw new HttpsError('not-found', 'That account no longer exists');
  const user = userSnap.data();
  if (user.isStaff) throw new HttpsError('failed-precondition', 'Staff accounts can\'t be removed here');
  const username = user.username;
  const usernameLower = user.usernameLower || String(username || '').toLowerCase();
  const removedBy = request.auth.token.username || request.auth.uid;
  const now = Date.now();

  // The login goes first: with it gone (and its sessions revoked) the
  // account can't act again while the rest is cleaned up.
  try {
    await admin.auth().deleteUser(uid);
  } catch (err) {
    if (err.code !== 'auth/user-not-found') throw err;
  }

  const batch = db.batch();
  batch.set(db.collection('removedUsers').doc(uid), { uid, username, clashTag: user.clashTag || '', removedBy, removedAt: now });
  batch.delete(userRef);
  batch.delete(db.collection('gemBalances').doc(uid));
  batch.delete(db.collection('ladderQueue').doc(uid));
  if (usernameLower) {
    // Kept (as a tombstone signUp treats as taken) so the name can't be re-registered.
    batch.set(db.collection('usernames').doc(usernameLower), { removed: true, removedBy, removedAt: now });
    batch.delete(db.collection('ladderRatings').doc(usernameLower));
  }
  const spins = await db.collection('rouletteSpins').where('uid', '==', uid).limit(400).get();
  spins.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();

  // Out of any tournament still taking signups. One already under way is
  // left alone - pulling a player from a live bracket is the existing
  // "remove player" tool's job, which also settles their matches.
  let signups = 0;
  if (username) {
    const open = await db.collection('tournaments').where('status', '==', 'signups_open').get();
    for (const doc of open.docs) {
      if ((doc.data().players || []).includes(username)) {
        await doc.ref.update({ players: admin.firestore.FieldValue.arrayRemove(username) });
        signups += 1;
      }
    }
  }
  logger.info('removeUser', { uid, username, removedBy });
  return { username, signupsRemoved: signups };
});

// ============================================================================
// renameUser — staff-only. Gives an account a new username everywhere the
// old one is load-bearing: the login (the username is the sign-in name), the
// profile, Gold balance, 1v1 rating and queue entry, and every tournament and
// match that records the player by name. The old name stays reserved so it
// can't be re-registered. The player is signed out and logs back in with the
// new name (same password). Not rewritten: old chat messages, flags and
// per-tournament prediction/reward records, which keep the name they were
// made under.
// ============================================================================
exports.renameUser = onCall({ timeoutSeconds: 120 }, async (request) => {
  if (!request.auth?.token?.isStaff) throw new HttpsError('permission-denied', 'Staff only');
  const { uid, newUsername } = request.data || {};
  if (!uid || typeof uid !== 'string') throw new HttpsError('invalid-argument', 'Missing user');
  let name;
  try {
    name = checkNewUsername(newUsername);
  } catch (err) {
    throw new HttpsError('invalid-argument', err.message);
  }

  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) throw new HttpsError('not-found', 'That account no longer exists');
  const oldName = userSnap.data().username;
  if (!oldName) throw new HttpsError('failed-precondition', 'That account has no username to change');
  if (name === oldName) throw new HttpsError('failed-precondition', 'That\'s already their name');
  const oldLower = oldName.toLowerCase();
  const newLower = name.toLowerCase();
  // Only the capitalisation changing: the reserved name slot stays the same.
  const sameSlot = oldLower === newLower;
  const by = request.auth.token.username || request.auth.uid;
  const now = Date.now();

  // 1. Claim the new name first, so two renames (or a sign-up) can't collide.
  const newNameRef = db.collection('usernames').doc(newLower);
  if (!sameSlot) {
    await db.runTransaction(async (tx) => {
      if ((await tx.get(newNameRef)).exists) throw new HttpsError('already-exists', 'That username is taken');
      tx.set(newNameRef, { uid, username: name });
    });
  }

  // 2. The login. If this fails nothing else has changed yet - give the
  // name back and stop.
  try {
    const authUser = await admin.auth().getUser(uid);
    await admin.auth().updateUser(uid, { email: usernameToEmail(name) });
    await admin.auth().setCustomUserClaims(uid, { ...(authUser.customClaims || {}), username: name });
    // Their current session still carries the old name; make them sign in again.
    await admin.auth().revokeRefreshTokens(uid);
  } catch (err) {
    if (!sameSlot) await newNameRef.delete().catch(() => {});
    logger.error('renameUser: login update failed', { uid, err });
    throw new HttpsError('aborted', 'Couldn\'t change the login for that account - nothing was renamed');
  }

  // 3. Everything that shows or looks up the name.
  const balanceRef = db.collection('gemBalances').doc(uid);
  const queueRef = db.collection('ladderQueue').doc(uid);
  const oldRatingRef = db.collection('ladderRatings').doc(oldLower);
  const stylesRef = db.collection('live').doc('nameStyles');
  const [balanceSnap, queueSnap, ratingSnap, stylesSnap] = await Promise.all(
    [balanceRef, queueRef, oldRatingRef, stylesRef].map((ref) => ref.get())
  );
  const batch = db.batch();
  batch.update(userRef, { username: name, usernameLower: newLower });
  batch.set(newNameRef, { uid, username: name });
  if (!sameSlot) batch.set(db.collection('usernames').doc(oldLower), { renamed: true, renamedTo: name, renamedBy: by, renamedAt: now });
  if (balanceSnap.exists) batch.update(balanceRef, { username: name });
  if (queueSnap.exists) batch.update(queueRef, { username: name });
  if (ratingSnap.exists) {
    batch.set(db.collection('ladderRatings').doc(newLower), { ...ratingSnap.data(), username: name });
    if (!sameSlot) batch.delete(oldRatingRef);
  }
  // A golden name follows the player to their new name.
  const gold = stylesSnap.exists ? stylesSnap.data().gold || [] : [];
  if (!sameSlot && gold.includes(oldLower)) {
    batch.set(stylesRef, { gold: [...gold.filter((n) => n !== oldLower), newLower] }, { merge: true });
  }
  batch.set(db.collection('renamedUsers').doc(), { uid, from: oldName, to: name, by, at: now });
  await batch.commit();

  // 4. Tournaments and matches record players by name.
  const writes = [];
  const tournaments = await db.collection('tournaments').get();
  tournaments.docs.forEach((d) => {
    const changes = renameChanges(d.data(), oldName, name);
    if (Object.keys(changes).length) writes.push([d.ref, changes]);
  });
  const tournamentCount = writes.length;
  const [asP1, asP2] = await Promise.all([
    db.collectionGroup('matches').where('player1', '==', oldName).get(),
    db.collectionGroup('matches').where('player2', '==', oldName).get(),
  ]);
  [...asP1.docs, ...asP2.docs].forEach((d) => {
    const changes = renameChanges(d.data(), oldName, name);
    if (Object.keys(changes).length) writes.push([d.ref, changes]);
  });
  for (let i = 0; i < writes.length; i += 400) {
    const chunk = db.batch();
    writes.slice(i, i + 400).forEach(([ref, changes]) => chunk.update(ref, changes));
    await chunk.commit();
  }

  logger.info('renameUser', { uid, from: oldName, to: name, by });
  return { from: oldName, to: name, tournaments: tournamentCount, matches: writes.length - tournamentCount };
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
    // Body included (truncated) so a systemic failure - an expired key, or the
    // relay's IP no longer on Supercell's allowlist - can be told apart from a
    // one-off bad tag after the fact, instead of just a bare status code.
    logger.warn('fetchClashPlayer: relay/API returned', {
      tag: cleanTag,
      status: response.status,
      body: (await response.text().catch(() => '')).slice(0, 300),
    });
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
    logger.warn('fetchLocalRanking: relay/API returned', {
      locationId,
      status: response.status,
      body: (await response.text().catch(() => '')).slice(0, 300),
    });
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

  // The 1v1 ladder isn't a tournament 'in_progress', so it gets its own pass.
  // Kept apart so a problem there can never hold up a tournament.
  try {
    await processLadder();
  } catch (err) {
    logger.error('processLadder failed', err);
  }
  try {
    await sweepLifeWindows();
  } catch (err) {
    logger.error('sweepLifeWindows failed', err);
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
    batch.update(tournamentRef, { status: 'in_progress', startedAt: now, bracketSize, playerStats, advancementVersion: 2 });
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

  for (const m of matches) {
    const matchRef = tournamentRef.collection('matches').doc(m.id);

    // One player readied up, the other never did - once the day is over (and
    // they've had a fair window since their opponent readied, see
    // readyUpDeadline) the ready player wins by forfeit rather than waiting
    // forever on an opponent who may not show up at all.
    if (m.status === 'pending' && m.player1Ready !== m.player2Ready) {
      const readyTime = m.player1Ready ? m.player1ReadyTime : m.player2ReadyTime;
      if (readyTime && now > readyUpDeadline(m, readyTime)) {
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

    if (now <= playDeadline(m)) continue;

    const player1Reported = !!m.winner1Vote;
    const player2Reported = !!m.winner2Vote;

    if (!player1Reported && !player2Reported) {
      // Both readied up but neither ever reported a result. Nobody advances
      // automatically and nobody is eliminated: staff decide who goes through
      // (the match chat and screenshots are on the review list). Only this
      // match waits - see planSingleElimAdvancement.
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

  // Combined into one update - a batch can only hold one write per document.
  if (disqualified.length > 0) {
    const uniqueDisqualified = [...new Set(disqualified)];
    batch.update(tournamentRef, {
      players: admin.firestore.FieldValue.arrayRemove(...uniqueDisqualified),
      removedPlayers: admin.firestore.FieldValue.arrayUnion(...uniqueDisqualified),
    });
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

// Advances a single-elimination tournament one bracket slot at a time, so a
// match stuck with staff only holds up its own branch. Tournaments that
// already contain a grace_period match (the old both-advance rule, which
// breaks the one-winner-per-match pairing this relies on) keep the older
// whole-round behaviour until they finish.
async function handleRoundAdvancement(tournamentRef, tournament, matches) {
  if (matches.some((m) => m.resolvedReason === 'grace_period')) {
    return handleRoundAdvancementWholeRound(tournamentRef, tournament, matches);
  }

  const { create, champion } = planSingleElimAdvancement({ tournament, matches });
  if (create.length > 0) {
    const batch = db.batch();
    create.forEach((doc) => batch.set(tournamentRef.collection('matches').doc(doc.id), doc));
    await batch.commit();
  }
  if (champion) {
    const placements = computePlacements(champion, matches);
    await tournamentRef.update({ status: 'completed', champion, placements });
  }
}

async function handleRoundAdvancementWholeRound(tournamentRef, tournament, matches) {
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

// Double elimination advances one bracket slot at a time (see doubleElim.js),
// so a match stuck with staff only holds up what depends on it. That layout
// differs from the older whole-round one (drop-ins used to be paired with each
// other), so only tournaments started with advancementVersion 2 use it; any
// already running keep the older logic until they finish.
async function handleDoubleEliminationAdvancement(tournamentRef, tournament, matches) {
  if (tournament.advancementVersion !== 2) {
    return handleDoubleEliminationAdvancementWholeRound(tournamentRef, tournament, matches);
  }

  const { create, champion } = planDoubleElimAdvancement({ tournament, matches });
  const batch = db.batch();
  create.forEach((doc) => batch.set(tournamentRef.collection('matches').doc(doc.id), doc));
  if (champion && tournament.status !== 'completed') {
    batch.update(tournamentRef, {
      status: 'completed',
      champion,
      placements: computeDoubleEliminationPlacements(matches),
    });
  }
  if (create.length > 0 || champion) await batch.commit();
}

async function handleDoubleEliminationAdvancementWholeRound(tournamentRef, tournament, matches) {
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
    if (t.kind === 'ladder') return; // the 1v1 ladder's container, not a tournament
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
    // Tell the players too, so they know it's being decided rather than lost.
    await Promise.all([after.player1, after.player2].map((player) => {
      const { text, linkLabel } = sentToStaffMessage(after, player);
      return notifyPlayer(player, text, linkLabel);
    }));
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

// When one player readies up first, tell the other so they don't sit on it:
// they have until the forfeit deadline. Fires only on the not-ready -> ready
// change while the other side still isn't (once both are ready, the match is
// on and there's nobody left to nudge).
exports.notifyOpponentReady = onDocumentUpdated(
  { document: 'tournaments/{tournamentId}/matches/{matchId}', secrets: [DISCORD_BOT_TOKEN] },
  async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();
    if (after.status !== 'pending' || !after.player1 || !after.player2 || after.player2 === 'BYE') return;

    let readyPlayer = null;
    let waitingPlayer = null;
    let readyTime = null;
    if (!before.player1Ready && after.player1Ready && !after.player2Ready) {
      [readyPlayer, waitingPlayer, readyTime] = [after.player1, after.player2, after.player1ReadyTime];
    } else if (!before.player2Ready && after.player2Ready && !after.player1Ready) {
      [readyPlayer, waitingPlayer, readyTime] = [after.player2, after.player1, after.player2ReadyTime];
    }
    if (!readyPlayer) return;

    const { text, linkLabel } = opponentReadyMessage(after, readyPlayer, readyTime || Date.now());
    await notifyPlayer(waitingPlayer, text, linkLabel);
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

    const { text, linkLabel } = chatMessage(msg.sender, msg.text);
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
      return { linked: false, message: 'That code isn\'t valid. Get a fresh one from your profile in the app.' };
    }
    const { uid, expiresAt } = snap.data();
    tx.delete(codeRef);
    if (Date.now() > expiresAt) {
      logger.info('link redeem: code expired', { code, uid });
      return { linked: false, message: 'That code has expired. Get a fresh one from your profile in the app.' };
    }
    tx.update(db.collection('users').doc(uid), { discordId: discordId });
    logger.info('link redeem: linked', { uid, discordId });
    return { linked: true, message: '✅ Linked! You\'ll now get your match reminders and chat messages here by DM.' };
  });
}

exports.discordInteractions = onRequest({ secrets: [DISCORD_BOT_TOKEN] }, async (req, res) => {
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
      const { linked, message } = await redeemLinkCode(codeOption?.value, discordId);
      let reply = message;
      // Optional: give linked players a role in the server they linked from.
      // A failure here (missing permission, bad role id) must not undo or hide
      // the link itself, so it's only logged. Read from the environment, not a
      // deploy param, so a deploy never stops to ask for it.
      const roleId = process.env.DISCORD_LINKED_ROLE_ID;
      if (linked && roleId) {
        const role = await addGuildRole({ token: DISCORD_BOT_TOKEN.value(), guildId: interaction.guild_id, userId: discordId, roleId });
        if (role.ok) reply += `\n🏅 You've been given the <@&${roleId}> role.`;
        else logger.warn('link role failed', { discordId, guildId: interaction.guild_id, ...role });
      }
      res.json(ephemeralReply(reply));
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

// ============================================================================
// Match predictions - scoring. Players vote on who will win a match before it
// starts (the rules only allow that while it's still pending); once it has a
// played result, each vote is marked right or wrong and the voter's running
// totals for that tournament are updated. It re-runs when staff change or
// reopen a result, applying only the difference (see predictions.js).
// ============================================================================
exports.scoreMatchPredictions = onDocumentUpdated(
  'tournaments/{tournamentId}/matches/{matchId}',
  async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();
    if (before.winner === after.winner && before.status === after.status && before.resolvedReason === after.resolvedReason) return;

    const predictionsSnap = await event.data.after.ref.collection('predictions').get();
    if (predictionsSnap.empty) return;

    const predictions = predictionsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    // Staff can set the day the leaderboard starts counting from (see
    // setPredictionsStartDay); earlier matches score for nobody.
    const tournamentSnap = await db.collection('tournaments').doc(event.params.tournamentId).get();
    const changes = planScoreChanges(after, predictions, tournamentSnap.data()?.predictionsFromDay || 1);
    const scoresRef = db.collection('tournaments').doc(event.params.tournamentId).collection('predictionScores');

    // Two writes per change; keep each batch well under Firestore's 500 limit.
    for (let i = 0; i < changes.length; i += 200) {
      const batch = db.batch();
      changes.slice(i, i + 200).forEach((c) => {
        batch.update(predictionsSnap.docs.find((d) => d.id === c.id).ref, { correct: c.correct });
        batch.set(scoresRef.doc(c.username.toLowerCase()), {
          username: c.username,
          correct: admin.firestore.FieldValue.increment(c.deltaCorrect),
          total: admin.firestore.FieldValue.increment(c.deltaTotal),
        }, { merge: true });
      });
      await batch.commit();
    }
  }
);

// Staff: only count predictions from a given day on, and recalculate this
// tournament's leaderboard to match. Nothing is deleted - every vote stays, and
// setting the day back to 1 counts them all again - so it's safe to change.
exports.setPredictionsStartDay = onCall(async (request) => {
  if (!request.auth?.token?.isStaff) throw new HttpsError('permission-denied', 'Only staff can reset the prediction leaderboard');

  const { tournamentId, fromDay } = request.data || {};
  const day = Number(fromDay);
  if (!tournamentId || !Number.isInteger(day) || day < 1 || day > 60) {
    throw new HttpsError('invalid-argument', 'Give a day between 1 and 60');
  }

  const tournamentRef = db.collection('tournaments').doc(String(tournamentId));
  if (!(await tournamentRef.get()).exists) throw new HttpsError('not-found', 'Tournament not found');

  const matchesSnap = await tournamentRef.collection('matches').get();
  const entries = [];
  const predictionRefs = {};
  for (const matchDoc of matchesSnap.docs) {
    const predictionsSnap = await matchDoc.ref.collection('predictions').get();
    if (predictionsSnap.empty) continue;
    entries.push({ match: matchDoc.data(), predictions: predictionsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) });
    predictionsSnap.docs.forEach((d) => { predictionRefs[`${matchDoc.id}/${d.id}`] = d.ref; });
  }
  const { totals, marks } = tallyScores(entries, day);

  // Firestore batches hold 500 writes, so do it in chunks. Order: replace the
  // totals first, then mark each vote, then record the setting.
  const scoresRef = tournamentRef.collection('predictionScores');
  const ops = [];
  (await scoresRef.get()).docs.forEach((d) => ops.push((batch) => batch.delete(d.ref)));
  Object.entries(totals).forEach(([key, row]) => ops.push((batch) => batch.set(scoresRef.doc(key), row)));
  marks.forEach((mark) => ops.push((batch) => batch.update(predictionRefs[`${mark.matchId}/${mark.id}`], { correct: mark.correct })));
  ops.push((batch) => batch.update(tournamentRef, { predictionsFromDay: day }));

  for (let i = 0; i < ops.length; i += 400) {
    const batch = db.batch();
    ops.slice(i, i + 400).forEach((op) => op(batch));
    await batch.commit();
  }
  return { fromDay: day, players: Object.keys(totals).length, votesCounted: Object.values(totals).reduce((n, r) => n + r.total, 0) };
});

// ============================================================================
// Live-stream betting. Viewers bet pretend gems on whether the streamer
// succeeds or fails at the current round. Balances (gemBalances/{uid}) and
// bets (liveRounds/{roundId}/bets/{uid}) are only written here - the rules
// make both read-only to clients - so nobody can hand themselves gems.
// ============================================================================

// Place, change or (side: null) take back a bet while the round is open.
// Changing refunds the old stake first, so switching sides or amounts is free.
exports.placeLiveBet = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Log in to bet');
  const { roundId, side = null, amount } = request.data || {};
  if (!roundId || typeof roundId !== 'string') throw new HttpsError('invalid-argument', 'Missing round');

  const uid = request.auth.uid;
  const username = request.auth.token.username || null;
  const roundRef = db.collection('liveRounds').doc(roundId);
  const betRef = roundRef.collection('bets').doc(uid);
  const balanceRef = db.collection('gemBalances').doc(uid);

  return db.runTransaction(async (tx) => {
    const [roundSnap, betSnap, balanceSnap] = await Promise.all([tx.get(roundRef), tx.get(betRef), tx.get(balanceRef)]);
    if (!roundSnap.exists) throw new HttpsError('not-found', 'That round no longer exists');
    const round = roundSnap.data();
    if (!bettingIsOpen({ ...round, openedAtMs: round.openedAt ? round.openedAt.toMillis() : null }, Date.now())) {
      throw new HttpsError('failed-precondition', 'Betting is closed for this round');
    }

    const balance = balanceSnap.exists ? balanceSnap.data().gems : STARTING_GEMS;
    const existingAmount = betSnap.exists ? betSnap.data().amount : 0;

    if (side === null) {
      if (!betSnap.exists) return { gems: balance };
      tx.delete(betRef);
      tx.set(balanceRef, { username, gems: balance + existingAmount }, { merge: true });
      return { gems: balance + existingAmount };
    }

    let plan;
    try {
      plan = planBet({ balance, existingAmount, side, amount, sides: ROUND_KINDS[kindOf(round)].sides });
    } catch (err) {
      throw new HttpsError('invalid-argument', err.message);
    }
    tx.set(betRef, { username, ...plan.bet, paid: false, updatedAt: Date.now() });
    tx.set(balanceRef, { username, gems: plan.balance }, { merge: true });
    return { gems: plan.balance };
  });
});

// Staff: settle a round with its result - 'succeed'/'fail', or the star
// count for an exact-stars round - paying out by that side's multiplier, or
// 'cancel' it (refunding every stake). The round is marked
// 'settling' first, which stops new bets, and each bet is marked paid in the
// same batch as its payout - so if this is cut off halfway, running it again
// with the same result just finishes the rest without paying anyone twice.
exports.settleLiveRound = onCall(async (request) => {
  if (!request.auth?.token?.isStaff) throw new HttpsError('permission-denied', 'Only staff can settle rounds');
  const { roundId, result } = request.data || {};
  if (!roundId || typeof roundId !== 'string') throw new HttpsError('invalid-argument', 'Missing round');
  if (typeof result !== 'string') throw new HttpsError('invalid-argument', 'Missing result');

  const roundRef = db.collection('liveRounds').doc(roundId);
  let multipliers;
  // Lives left after this result cost one, or null if it didn't (see below).
  let livesLeft = null;
  await db.runTransaction(async (tx) => {
    livesLeft = null;
    const snap = await tx.get(roundRef);
    if (!snap.exists) throw new HttpsError('not-found', 'Round not found');
    const round = snap.data();
    const kind = ROUND_KINDS[kindOf(round)];
    if (result !== 'cancel' && !kind.sides.includes(result)) {
      throw new HttpsError('invalid-argument', `Result must be one of ${kind.sides.join(', ')} or cancel`);
    }
    multipliers = kind.multipliers;
    if (round.status === 'settled' || round.status === 'cancelled') {
      throw new HttpsError('failed-precondition', 'This round is already finished');
    }
    if (round.status === 'undoing') {
      throw new HttpsError('failed-precondition', 'This round\'s payout is being undone - finish that first');
    }
    if (round.status === 'settling' && round.pendingResult !== result) {
      throw new HttpsError('failed-precondition', `This round is already being settled as "${round.pendingResult}"`);
    }
    // An attack that wasn't a 6-star costs a life on the extra-lives run
    // that's on screen. Done here, as the round first moves to 'settling',
    // so re-running a cut-off settle can't take a second one.
    let runRef = null;
    let run = null;
    if (round.status !== 'settling' && attackCostsLife(kindOf(round), result)) {
      const stateSnap = await tx.get(db.collection('live').doc('state'));
      const runId = stateSnap.exists ? stateSnap.data().lifeRunId : null;
      if (runId) {
        runRef = db.collection('lifeRuns').doc(runId);
        const runSnap = await tx.get(runRef);
        if (runSnap.exists && runSnap.data().status === 'active') run = runSnap.data();
      }
    }
    tx.update(roundRef, { status: 'settling', pendingResult: result, ...(run ? { lifeLost: true } : {}) });
    if (run) {
      const next = loseLife(run);
      tx.update(runRef, next);
      livesLeft = next.lives;
    }
  });

  let paidOut = 0;
  let bettors = 0;
  for (;;) {
    const unpaid = await roundRef.collection('bets').where('paid', '==', false).limit(200).get();
    if (unpaid.empty) break;
    const batch = db.batch();
    unpaid.docs.forEach((d) => {
      const bet = d.data();
      const payout = result === 'cancel' ? bet.amount : payoutFor(bet, result, multipliers);
      batch.update(d.ref, { paid: true, payout });
      if (payout > 0) {
        batch.set(db.collection('gemBalances').doc(d.id), {
          gems: admin.firestore.FieldValue.increment(payout),
        }, { merge: true });
      }
      paidOut += payout;
      bettors += 1;
    });
    await batch.commit();
  }

  await roundRef.update({
    status: result === 'cancel' ? 'cancelled' : 'settled',
    result: result === 'cancel' ? null : result,
    settledAt: Date.now(),
  });
  return { bettors, paidOut, livesLeft };
});

// Staff: undo a round that was settled (or cancelled) wrongly. Every bet's
// payout is taken back and the round returns to 'closed' - betting over,
// bets intact - ready to be settled again with the right result. A life the
// wrong result cost is given back. Mirrors settleLiveRound: the round is
// marked 'undoing' first and each bet is un-paid in the same batch as its
// Gold comes back, so re-running a cut-off undo just finishes the rest.
// A balance can go below zero if the Gold was already spent.
exports.undoLiveRound = onCall(async (request) => {
  if (!request.auth?.token?.isStaff) throw new HttpsError('permission-denied', 'Only staff can undo payouts');
  const { roundId } = request.data || {};
  if (!roundId || typeof roundId !== 'string') throw new HttpsError('invalid-argument', 'Missing round');

  const roundRef = db.collection('liveRounds').doc(roundId);
  let livesNow = null;
  await db.runTransaction(async (tx) => {
    livesNow = null;
    const snap = await tx.get(roundRef);
    if (!snap.exists) throw new HttpsError('not-found', 'Round not found');
    const round = snap.data();
    if (round.status === 'undoing') return;
    if (round.status !== 'settled' && round.status !== 'cancelled') {
      throw new HttpsError('failed-precondition', 'Only a finished round can be undone');
    }

    // Give back the life this result took, to the run that's on screen.
    let runRef = null;
    let run = null;
    if (round.lifeLost) {
      const stateSnap = await tx.get(db.collection('live').doc('state'));
      const runId = stateSnap.exists ? stateSnap.data().lifeRunId : null;
      if (runId) {
        runRef = db.collection('lifeRuns').doc(runId);
        const runSnap = await tx.get(runRef);
        if (runSnap.exists && runSnap.data().status === 'active') run = runSnap.data();
      }
    }
    tx.update(roundRef, { status: 'undoing', lifeLost: admin.firestore.FieldValue.delete() });
    if (run) {
      livesNow = Math.min(MAX_LIVES, run.lives + 1);
      tx.update(runRef, { lives: livesNow });
    }
  });

  let takenBack = 0;
  let bettors = 0;
  for (;;) {
    const paid = await roundRef.collection('bets').where('paid', '==', true).limit(200).get();
    if (paid.empty) break;
    const batch = db.batch();
    paid.docs.forEach((d) => {
      const payout = d.data().payout || 0;
      batch.update(d.ref, { paid: false, payout: admin.firestore.FieldValue.delete() });
      if (payout > 0) {
        batch.set(db.collection('gemBalances').doc(d.id), {
          gems: admin.firestore.FieldValue.increment(-payout),
        }, { merge: true });
      }
      takenBack += payout;
      bettors += 1;
    });
    await batch.commit();
  }

  await roundRef.update({
    status: 'closed',
    result: null,
    pendingResult: admin.firestore.FieldValue.delete(),
    settledAt: admin.firestore.FieldValue.delete(),
  });
  return { bettors, takenBack, livesNow };
});

// ============================================================================
// Community challenge goals. Viewers donate gems toward a target; the
// donation that reaches it picks random challenges from the goal's pool and
// opens a timed vote for everyone who donated. Goals are created by staff
// from the client (the rules check the shape); everything that moves gems or
// changes a goal's status happens here.
// ============================================================================

exports.donateToChallengeGoal = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Log in to donate');
  const { goalId, amount } = request.data || {};
  if (!goalId || typeof goalId !== 'string') throw new HttpsError('invalid-argument', 'Missing goal');

  const uid = request.auth.uid;
  const username = request.auth.token.username || null;
  const goalRef = db.collection('challengeGoals').doc(goalId);
  const donationRef = goalRef.collection('donations').doc(uid);
  const balanceRef = db.collection('gemBalances').doc(uid);

  return db.runTransaction(async (tx) => {
    const [goalSnap, donationSnap, balanceSnap] = await Promise.all([tx.get(goalRef), tx.get(donationRef), tx.get(balanceRef)]);
    if (!goalSnap.exists) throw new HttpsError('not-found', 'That goal no longer exists');
    const goal = goalSnap.data();
    if (goal.status !== 'collecting') throw new HttpsError('failed-precondition', 'This goal isn\'t taking donations any more');

    const balance = balanceSnap.exists ? balanceSnap.data().gems : STARTING_GEMS;
    let plan;
    try {
      plan = planDonation({ balance, raised: goal.raised, target: goal.target, amount });
    } catch (err) {
      throw new HttpsError('invalid-argument', err.message);
    }

    const goalUpdate = { raised: plan.raised };
    if (plan.reached) {
      Object.assign(goalUpdate, {
        status: 'voting',
        options: pickOptions(goal.pool),
        votingOpenedAt: admin.firestore.FieldValue.serverTimestamp(),
        votingMs: VOTING_MS,
      });
    }
    tx.update(goalRef, goalUpdate);
    tx.set(balanceRef, { username, gems: plan.balance }, { merge: true });
    tx.set(donationRef, donationSnap.exists
      ? { gems: donationSnap.data().gems + plan.taken }
      : { username, gems: plan.taken, vote: null, refunded: false }, { merge: true });
    return { taken: plan.taken, gems: plan.balance, reached: plan.reached };
  });
});

// Donors only, one vote each, changeable until the countdown ends.
exports.voteOnChallenge = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Log in to vote');
  const { goalId, option } = request.data || {};
  if (!goalId || typeof goalId !== 'string') throw new HttpsError('invalid-argument', 'Missing goal');

  const goalRef = db.collection('challengeGoals').doc(goalId);
  const donationRef = goalRef.collection('donations').doc(request.auth.uid);
  await db.runTransaction(async (tx) => {
    const [goalSnap, donationSnap] = await Promise.all([tx.get(goalRef), tx.get(donationRef)]);
    if (!goalSnap.exists) throw new HttpsError('not-found', 'That goal no longer exists');
    const goal = goalSnap.data();
    const openedAtMs = goal.votingOpenedAt ? goal.votingOpenedAt.toMillis() : null;
    if (!votingIsOpen({ ...goal, votingOpenedAtMs: openedAtMs }, Date.now())) {
      throw new HttpsError('failed-precondition', 'Voting is closed');
    }
    if (!donationSnap.exists) throw new HttpsError('permission-denied', 'Only people who donated to this goal can vote');
    if (!Number.isInteger(option) || option < 0 || option >= goal.options.length) {
      throw new HttpsError('invalid-argument', 'Pick one of the challenges');
    }
    tx.update(donationRef, { vote: option });
  });
  return { success: true };
});

// Staff: call off a goal that's still collecting or voting and give every
// donor their gems back. Like settleLiveRound, each refund is marked in the
// same batch as the gems it returns, so re-running it finishes a cut-off one.
exports.cancelChallengeGoal = onCall(async (request) => {
  if (!request.auth?.token?.isStaff) throw new HttpsError('permission-denied', 'Only staff can cancel goals');
  const { goalId } = request.data || {};
  if (!goalId || typeof goalId !== 'string') throw new HttpsError('invalid-argument', 'Missing goal');

  const goalRef = db.collection('challengeGoals').doc(goalId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(goalRef);
    if (!snap.exists) throw new HttpsError('not-found', 'Goal not found');
    if (!['collecting', 'voting', 'cancelling'].includes(snap.data().status)) {
      throw new HttpsError('failed-precondition', 'This goal is already finished');
    }
    tx.update(goalRef, { status: 'cancelling' });
  });

  let refunded = 0;
  for (;;) {
    const pending = await goalRef.collection('donations').where('refunded', '==', false).limit(200).get();
    if (pending.empty) break;
    const batch = db.batch();
    pending.docs.forEach((d) => {
      const gems = d.data().gems || 0;
      batch.update(d.ref, { refunded: true });
      if (gems > 0) {
        batch.set(db.collection('gemBalances').doc(d.id), { gems: admin.firestore.FieldValue.increment(gems) }, { merge: true });
      }
      refunded += gems;
    });
    await batch.commit();
  }
  await goalRef.update({ status: 'cancelled' });
  return { refunded };
});

// ============================================================================
// Gem Roulette - a solo gem game. The server rolls (crypto-secure) and
// pays out in one transaction; the wheel animation on the page just shows
// where this already landed. Each spin is logged to rouletteSpins for the
// public "recent spins" feed.
// ============================================================================
exports.spinRoulette = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Log in to spin');
  const { pick, amount } = request.data || {};
  const uid = request.auth.uid;
  const username = request.auth.token.username || null;
  const balanceRef = db.collection('gemBalances').doc(uid);
  const spinRef = db.collection('rouletteSpins').doc();

  return db.runTransaction(async (tx) => {
    const balanceSnap = await tx.get(balanceRef);
    const data = balanceSnap.exists ? balanceSnap.data() : {};
    const balance = balanceSnap.exists ? data.gems : STARTING_GEMS;
    const now = Date.now();
    try {
      checkSpin({ balance, pick, amount, lastSpinAt: data.lastSpinAt || 0, now });
    } catch (err) {
      throw new HttpsError('invalid-argument', err.message);
    }

    const pocket = crypto.randomInt(POCKET_COUNT);
    const payout = spinPayout(pick, pocket, amount);
    const gems = balance - amount + payout;
    tx.set(balanceRef, { username, gems, lastSpinAt: now }, { merge: true });
    tx.set(spinRef, { uid, username, pick, amount, pocket, landed: POCKETS[pocket], payout, at: now });
    return { pocket, landed: POCKETS[pocket], payout, gems };
  });
});

// ============================================================================
// Gem drops - free gems staff hand out on stream. Staff create the drop from
// the client (the rules check the shape and that openedAt is server time);
// claiming happens here so each account gets it once, and only in time.
// Claims don't touch the drop doc itself, so a rush of viewers clicking at
// once doesn't pile up on one document.
// ============================================================================
exports.claimGemDrop = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Log in to claim');
  const { dropId } = request.data || {};
  if (!dropId || typeof dropId !== 'string') throw new HttpsError('invalid-argument', 'Missing drop');

  const uid = request.auth.uid;
  const username = request.auth.token.username || null;
  const dropRef = db.collection('gemDrops').doc(dropId);
  const claimRef = dropRef.collection('claims').doc(uid);
  const balanceRef = db.collection('gemBalances').doc(uid);

  return db.runTransaction(async (tx) => {
    const [dropSnap, claimSnap, balanceSnap] = await Promise.all([tx.get(dropRef), tx.get(claimRef), tx.get(balanceRef)]);
    if (!dropSnap.exists) throw new HttpsError('not-found', 'That drop no longer exists');
    const drop = dropSnap.data();
    const openedAtMs = drop.openedAt ? drop.openedAt.toMillis() : null;
    if (!dropIsOpen({ ...drop, openedAtMs }, Date.now())) throw new HttpsError('failed-precondition', 'Too late - this drop is over');
    if (claimSnap.exists) throw new HttpsError('already-exists', 'You already claimed this drop');

    const balance = balanceSnap.exists ? balanceSnap.data().gems : STARTING_GEMS;
    tx.set(claimRef, { username, gems: drop.amount, at: Date.now() });
    tx.set(balanceRef, { username, gems: balance + drop.amount }, { merge: true });
    return { gems: balance + drop.amount, amount: drop.amount };
  });
});

// ============================================================================
// The 1v1 ladder. Players queue and are paired with someone of similar
// rating; the 1v1 is then an ordinary match under tournaments/ladder, so
// ready-up, self-reporting, disputes, chat and the Discord DMs are the
// tournament ones, unchanged. What's added here: the queue, a flat 24h
// window, and Elo ratings (ladderRatings/{usernameLower}).
// ============================================================================
const ladderRef = db.collection('tournaments').doc(LADDER_ID);
const ladderQueueRef = db.collection('ladderQueue');
const ladderRatingRef = (username) => db.collection('ladderRatings').doc(username.toLowerCase());

// The tournament-shaped doc the ladder's matches hang off. It has to exist
// (the match rules read it) and `startedAt: null` keeps them always unlocked;
// status 'ladder' keeps it out of every tournament list and the scheduler's
// bracket logic.
const LADDER_DOC = {
  id: LADDER_ID, kind: 'ladder', name: '1v1 Ladder', status: 'ladder', format: 'ladder',
  startedAt: null, players: [], createdBy: 'system',
};

// Who `username` already has an unfinished 1v1 against - they aren't paired
// with them again until that one is done.
async function openLadderOpponents(username) {
  const matches = ladderRef.collection('matches');
  const [asP1, asP2] = await Promise.all([
    matches.where('player1', '==', username).where('completedAt', '==', null).get(),
    matches.where('player2', '==', username).where('completedAt', '==', null).get(),
  ]);
  return new Set([...asP1.docs.map((d) => d.data().player2), ...asP2.docs.map((d) => d.data().player1)]);
}

// Reads (inside the transaction) the two players' Clash tags, then writes
// the match. `a` is listed first - the one who waited longer.
async function createLadderMatch(tx, a, b, now) {
  const usersSnap = await tx.get(
    db.collection('users').where('usernameLower', 'in', [a.username.toLowerCase(), b.username.toLowerCase()])
  );
  const playerStats = {};
  usersSnap.docs.forEach((d) => {
    const data = d.data();
    playerStats[data.username] = { tag: data.clashTag || '', bestBuilderBaseTrophies: data.bestBuilderBaseTrophies || 0 };
  });
  const ref = ladderRef.collection('matches').doc();
  tx.set(ladderRef, LADDER_DOC, { merge: true });
  tx.set(ref, {
    ...newMatchDoc({ id: ref.id, tournamentId: LADDER_ID, player1: a.username, player2: b.username, round: 1, playerStats, now }),
    ladder: true,
    createdAt: now,
    dayEndsAt: now + LADDER_MATCH_MS,
    player1Rating: a.rating,
    player2Rating: b.rating,
  });
  return ref.id;
}

// Join the queue. If someone suitable is already waiting you're matched on
// the spot; otherwise you wait, and the scheduler pairs you once the rating
// range has widened enough (see allowedGap in ladder.js).
exports.joinLadderQueue = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Log in to play 1v1s');
  const uid = request.auth.uid;
  const username = request.auth.token.username;
  if (!username) throw new HttpsError('failed-precondition', 'This account has no username');

  // Same bar as joining a tournament: a verified Clash account, and Discord
  // linked so players can be reached about their match.
  const profile = (await db.collection('users').doc(uid).get()).data() || {};
  if (!profile.clashVerified) throw new HttpsError('failed-precondition', 'Verify your Clash of Clans account to play 1v1s');
  if (!profile.discordId) throw new HttpsError('failed-precondition', 'Link your Discord account to play 1v1s');

  const [ratingSnap, playing] = await Promise.all([ladderRatingRef(username).get(), openLadderOpponents(username)]);
  const rating = ratingSnap.exists ? ratingSnap.data().rating : START_RATING;

  return db.runTransaction(async (tx) => {
    const now = Date.now();
    const queueSnap = await tx.get(ladderQueueRef);
    const mine = queueSnap.docs.find((d) => d.id === uid);
    const me = { uid, username, rating, joinedAt: mine ? mine.data().joinedAt : now };
    const others = queueSnap.docs.filter((d) => d.id !== uid).map((d) => d.data());
    const opponent = pickOpponent(me, others, now, (x, y) => playing.has(x === username ? y : x));

    if (!opponent) {
      tx.set(ladderQueueRef.doc(uid), me);
      return { matched: false };
    }
    const matchId = await createLadderMatch(tx, opponent, me, now);
    tx.delete(ladderQueueRef.doc(opponent.uid));
    if (mine) tx.delete(mine.ref);
    return { matched: true, matchId, opponent: opponent.username };
  });
});

exports.leaveLadderQueue = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Log in first');
  await ladderQueueRef.doc(request.auth.uid).delete();
  return { success: true };
});

// Pairs up whoever in the queue can now be paired - people whose acceptable
// rating range has widened since they joined. Each pair is made in its own
// transaction, which re-checks both are still waiting.
async function runLadderMatchmaking() {
  const queueSnap = await ladderQueueRef.get();
  if (queueSnap.size < 2) return;
  const entries = queueSnap.docs.map((d) => d.data());
  const playing = {};
  await Promise.all(entries.map(async (e) => { playing[e.username] = await openLadderOpponents(e.username); }));
  const now = Date.now();
  const pairs = pairQueue(entries, now, (x, y) => playing[x]?.has(y) || playing[y]?.has(x));

  for (const [a, b] of pairs) {
    try {
      await db.runTransaction(async (tx) => {
        const [aSnap, bSnap] = await Promise.all([tx.get(ladderQueueRef.doc(a.uid)), tx.get(ladderQueueRef.doc(b.uid))]);
        if (!aSnap.exists || !bSnap.exists) return;
        await createLadderMatch(tx, a, b, Date.now());
        tx.delete(aSnap.ref);
        tx.delete(bSnap.ref);
      });
    } catch (err) {
      logger.error('ladder pairing failed', { a: a.username, b: b.username, err });
    }
  }
}

// The scheduler's pass over the ladder: settle overdue 1v1s exactly as
// tournament matches are, send the same reminders, then pair the queue.
async function processLadder() {
  const now = Date.now();
  const openSnap = await ladderRef.collection('matches').where('completedAt', '==', null).get();
  const matches = openSnap.docs.map((d) => d.data());

  // Neither player readied up in the whole window: nothing was played and
  // both are no-shows. (handleTimeouts covers the case where only one did.)
  const batch = db.batch();
  let abandoned = 0;
  for (const m of matches) {
    if (m.status === 'pending' && !m.player1Ready && !m.player2Ready && now > matchDayEnd(m)) {
      batch.update(ladderRef.collection('matches').doc(m.id), {
        status: 'completed', winner: null, resolvedReason: 'both_no_show', autoResolvedAt: now, completedAt: now,
      });
      abandoned += 1;
    }
  }
  if (abandoned) await batch.commit();

  await handleTimeouts(ladderRef, LADDER_DOC, matches);
  await sendMatchReminders(ladderRef, matches);
  await runLadderMatchmaking();
}

// Moves both players' ratings when a 1v1 finishes - however it finished
// (agreed result, staff decision, forfeit). The outcome is recorded on the
// match (`rating`), which is also what makes this run once per match.
exports.rateLadderMatch = onDocumentUpdated(`tournaments/${LADDER_ID}/matches/{matchId}`, async (event) => {
  const after = event.data.after.data();
  if (after.rating || !outcomeOf(after)) return;

  await db.runTransaction(async (tx) => {
    const matchSnap = await tx.get(event.data.after.ref);
    const m = matchSnap.data();
    const outcome = m && outcomeOf(m);
    if (!outcome || m.rating) return;

    const refs = [ladderRatingRef(m.player1), ladderRatingRef(m.player2)];
    const [snap1, snap2] = await Promise.all(refs.map((ref) => tx.get(ref)));
    const current = (snap, username) => (snap.exists
      ? snap.data()
      : { username, rating: START_RATING, games: 0, wins: 0, losses: 0 });
    const p1 = current(snap1, m.player1);
    const p2 = current(snap2, m.player2);
    const change = rateMatch(p1, p2, outcome);

    const now = Date.now();
    const apply = (p, c) => ({
      username: p.username,
      rating: p.rating + c.delta,
      games: p.games + c.games,
      wins: p.wins + c.wins,
      losses: p.losses + c.losses,
      updatedAt: now,
    });
    tx.set(refs[0], apply(p1, change.p1));
    tx.set(refs[1], apply(p2, change.p2));
    tx.update(matchSnap.ref, {
      rating: {
        type: outcome.type,
        p1: { before: p1.rating, delta: change.p1.delta },
        p2: { before: p2.rating, delta: change.p2.delta },
      },
    });
  });
});

// ============================================================================
// Extra lives. The streamer plays a run with a number of lives (a
// lifeRuns/{runId} doc, started by staff from the client); a failed attack
// takes one (see settleLiveRound). Viewers buy more in timed windows the
// streamer opens: `run.window` is { id, openedAt, ms, raised, state }, and
// each viewer's Gold in it is lifeRuns/{runId}/windows/{id}/donations/{uid}.
// Fill the bar in time and the run gains a life and the next costs more;
// run out of time and every donation is refunded. Only these functions move
// Gold into or out of a window, or add a life from one.
// ============================================================================
const lifeRunRef = (runId) => db.collection('lifeRuns').doc(runId);
const lifeWindowOf = (run) => (run.window
  ? { ...run.window, openedAtMs: run.window.openedAt ? run.window.openedAt.toMillis() : null }
  : null);

// Staff: open a window - viewers get LIFE_WINDOW_MS to fill the bar.
exports.openLifeWindow = onCall(async (request) => {
  if (!request.auth?.token?.isStaff) throw new HttpsError('permission-denied', 'Only staff can open an extra-life goal');
  const { runId } = request.data || {};
  if (!runId || typeof runId !== 'string') throw new HttpsError('invalid-argument', 'Missing run');

  const runRef = lifeRunRef(runId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(runRef);
    if (!snap.exists) throw new HttpsError('not-found', 'That run no longer exists');
    const run = snap.data();
    if (run.status !== 'active') throw new HttpsError('failed-precondition', 'This run is over');
    if (run.window) throw new HttpsError('failed-precondition', 'An extra-life goal is already open');
    const id = runRef.collection('windows').doc().id;
    tx.update(runRef, {
      window: { id, openedAt: admin.firestore.FieldValue.serverTimestamp(), ms: LIFE_WINDOW_MS, raised: 0, state: 'open' },
    });
    return { windowId: id };
  });
});

exports.donateToLifeGoal = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Log in to donate');
  const { runId, amount } = request.data || {};
  if (!runId || typeof runId !== 'string') throw new HttpsError('invalid-argument', 'Missing run');

  const uid = request.auth.uid;
  const username = request.auth.token.username || null;
  const runRef = lifeRunRef(runId);
  const balanceRef = db.collection('gemBalances').doc(uid);

  return db.runTransaction(async (tx) => {
    const runSnap = await tx.get(runRef);
    if (!runSnap.exists) throw new HttpsError('not-found', 'That run no longer exists');
    const run = runSnap.data();
    const window = lifeWindowOf(run);
    const now = Date.now();
    if (run.status !== 'active' || !windowIsOpen(window, now)) {
      throw new HttpsError('failed-precondition', 'The extra-life goal isn\'t open right now');
    }

    const donationRef = runRef.collection('windows').doc(window.id).collection('donations').doc(uid);
    const [donationSnap, balanceSnap] = await Promise.all([tx.get(donationRef), tx.get(balanceRef)]);
    const balance = balanceSnap.exists ? balanceSnap.data().gems : STARTING_GEMS;
    let plan;
    try {
      // Same rule as a challenge goal: only what the bar still needs is taken.
      plan = planDonation({ balance, raised: window.raised, target: run.price, amount });
    } catch (err) {
      throw new HttpsError('invalid-argument', err.message);
    }

    // Filling the bar buys the life and ends the window; `lastWindow` is
    // what the page and overlay announce afterwards.
    const bought = plan.reached ? buyLife(run) : null;
    tx.update(runRef, bought
      ? { ...bought, lastBuyer: username, window: null, lastWindow: { id: window.id, result: 'bought', by: username, price: run.price, at: now } }
      : { 'window.raised': plan.raised });
    tx.set(balanceRef, { username, gems: plan.balance }, { merge: true });
    tx.set(donationRef, {
      username,
      gems: (donationSnap.exists ? donationSnap.data().gems : 0) + plan.taken,
      // A filled window keeps its Gold; only an unfilled one refunds these.
      refunded: false,
    });
    return { taken: plan.taken, gems: plan.balance, lifeBought: plan.reached, lives: bought ? bought.lives : run.lives };
  });
});

// Closes a run's window once its countdown has run out without the bar
// being filled (or straight away when `force`d by staff), refunding every
// donation. The window is marked 'refunding' first so no more Gold comes in,
// and each refund marks its donation in the same transaction as the Gold
// goes back - so this can be called by several things at once (the overlay,
// the staff page, the scheduler) or re-run after a cut-off without anyone
// being refunded twice.
async function closeLifeWindow(runRef, { force = false } = {}) {
  const closing = await db.runTransaction(async (tx) => {
    const snap = await tx.get(runRef);
    if (!snap.exists) return null;
    const window = lifeWindowOf(snap.data());
    if (!window) return null;
    if (window.state !== 'refunding') {
      if (!force && !windowHasExpired(window, Date.now())) return null;
      tx.update(runRef, { 'window.state': 'refunding', 'window.closedBy': force ? 'staff' : 'timer' });
    }
    return { id: window.id, raised: window.raised, cancelled: window.state === 'refunding' ? window.closedBy === 'staff' : force };
  });
  if (!closing) return { closed: false, refunded: 0 };

  const donationsRef = runRef.collection('windows').doc(closing.id).collection('donations');
  let refunded = 0;
  for (;;) {
    const batch = await db.runTransaction(async (tx) => {
      const pending = await tx.get(donationsRef.where('refunded', '==', false).limit(100));
      let gems = 0;
      pending.docs.forEach((d) => {
        const given = d.data().gems || 0;
        tx.update(d.ref, { refunded: true });
        if (given > 0) {
          tx.set(db.collection('gemBalances').doc(d.id), { gems: admin.firestore.FieldValue.increment(given) }, { merge: true });
        }
        gems += given;
      });
      return { count: pending.size, gems };
    });
    if (!batch.count) break;
    refunded += batch.gems;
  }

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(runRef);
    if (!snap.exists || snap.data().window?.id !== closing.id) return;
    tx.update(runRef, {
      window: null,
      lastWindow: { id: closing.id, result: closing.cancelled ? 'cancelled' : 'expired', raised: closing.raised, at: Date.now() },
    });
  });
  return { closed: true, refunded };
}

// Called by the overlay and the staff page when they see the countdown hit
// zero (no login needed - it only ever does what the timer already decided),
// and by staff to call a window off early.
exports.closeLifeWindow = onCall(async (request) => {
  const { runId, cancel } = request.data || {};
  if (!runId || typeof runId !== 'string') throw new HttpsError('invalid-argument', 'Missing run');
  const force = !!cancel;
  if (force && !request.auth?.token?.isStaff) throw new HttpsError('permission-denied', 'Only staff can cancel an extra-life goal');
  return closeLifeWindow(lifeRunRef(runId), { force });
});

// The scheduler's backstop: refund any window that ran out with nobody
// around to notice (no overlay open, staff page closed).
async function sweepLifeWindows() {
  const snap = await db.collection('lifeRuns').where('window.state', 'in', ['open', 'refunding']).get();
  for (const doc of snap.docs) {
    await closeLifeWindow(doc.ref);
  }
}
