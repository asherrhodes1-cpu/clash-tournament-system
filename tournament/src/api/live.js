import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  serverTimestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
import { BETTING_SECONDS } from '../live/liveUtils';

// live/state holds what's on right now: the YouTube link and which betting
// round is featured on the live page and the OBS overlay. Everything here is
// publicly readable because the overlay runs in OBS without an account.
const stateRef = doc(db, 'live', 'state');
const roundsRef = collection(db, 'liveRounds');
const betsRef = (roundId) => collection(db, 'liveRounds', roundId, 'bets');
const balancesRef = collection(db, 'gemBalances');

// Calls a Cloud Function. A request that never reaches the code (a network
// blip, or a function still coming online after a deploy) surfaces from
// Firebase as a bare "internal"; say something a player can act on instead.
async function call(callable, data) {
  try {
    return (await callable(data)).data;
  } catch (err) {
    if (err.code === 'functions/internal' || err.code === 'functions/unavailable') {
      throw new Error('Couldn\'t reach the server - try again in a moment.');
    }
    throw err;
  }
}

// A round as the page uses it, with openedAt as milliseconds. Right after
// staff open betting the server timestamp is still pending locally, so it's
// estimated rather than left empty - the countdown starts straight away.
function toRound(snap) {
  const data = snap.data({ serverTimestamps: 'estimate' });
  return { id: snap.id, ...data, openedAtMs: data.openedAt ? data.openedAt.toMillis() : null };
}

export function subscribeToLiveState(onChange) {
  return onSnapshot(
    stateRef,
    (snap) => onChange(snap.exists() ? snap.data() : {}),
    () => onChange({})
  );
}

export function subscribeToLiveRound(roundId, onChange) {
  return onSnapshot(
    doc(roundsRef, roundId),
    (snap) => onChange(snap.exists() ? toRound(snap) : null),
    () => onChange(null)
  );
}

// Every bet on a round: [{ id (the bettor's uid), username, side, amount, payout }].
export function subscribeToRoundBets(roundId, onChange) {
  return onSnapshot(
    betsRef(roundId),
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => onChange([])
  );
}

// Staff: the most recent rounds, newest first.
export function subscribeToRecentRounds(onChange, count = 10) {
  return onSnapshot(
    query(roundsRef, orderBy('createdAt', 'desc'), limit(count)),
    (snap) => onChange(snap.docs.map(toRound)),
    () => onChange([])
  );
}

// A player's gems, or null if they've never bet (they then start with
// STARTING_GEMS the first time they do).
export function subscribeToMyGems(uid, onChange) {
  return onSnapshot(
    doc(balancesRef, uid),
    (snap) => onChange(snap.exists() ? snap.data().gems : null),
    () => onChange(null)
  );
}

export function subscribeToGemLeaderboard(onChange, count = 10) {
  return onSnapshot(
    query(balancesRef, orderBy('gems', 'desc'), limit(count)),
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => onChange([])
  );
}

const placeLiveBetCallable = httpsCallable(functions, 'placeLiveBet');
const settleLiveRoundCallable = httpsCallable(functions, 'settleLiveRound');
const undoLiveRoundCallable = httpsCallable(functions, 'undoLiveRound');

// Place or change a bet on one of the round's sides; balances are handled by the
// Cloud Function. Resolves to the player's new gem balance.
export async function placeLiveBet(roundId, side, amount) {
  return (await call(placeLiveBetCallable, { roundId, side, amount })).gems;
}

export async function removeLiveBet(roundId) {
  return (await call(placeLiveBetCallable, { roundId, side: null })).gems;
}

export async function setLiveVideoUrl(videoUrl) {
  await setDoc(stateRef, { videoUrl }, { merge: true });
}

// A new round opens for betting straight away with a BETTING_SECONDS
// countdown, and becomes the featured one.
// kind is 'outcome' (succeed/fail) or 'stars' (exact star count).
export async function createLiveRound(description, createdBy, kind = 'outcome') {
  const ref = await addDoc(roundsRef, {
    description,
    kind,
    status: 'open',
    result: null,
    createdBy,
    createdAt: Date.now(),
    openedAt: serverTimestamp(),
    bettingMs: BETTING_SECONDS * 1000,
  });
  await featureLiveRound(ref.id);
  return ref.id;
}

// null takes the featured round off the live page and the overlay.
export async function featureLiveRound(roundId) {
  await setDoc(stateRef, { roundId }, { merge: true });
}

// 'closed' stops betting early; 'open' reopens it with a fresh countdown.
export async function setLiveRoundStatus(roundId, status) {
  await updateDoc(doc(roundsRef, roundId), status === 'open' ? { status, openedAt: serverTimestamp() } : { status });
}

// One of the round's sides (the result), or 'cancel' (refund everyone).
export async function settleLiveRound(roundId, result) {
  return call(settleLiveRoundCallable, { roundId, result });
}

// Staff: undo a wrongly settled (or cancelled) round - takes every payout
// back and returns it to 'closed' so it can be settled again. Resolves to
// { bettors, takenBack, livesNow (if a life was given back) }.
export async function undoLiveRound(roundId) {
  return call(undoLiveRoundCallable, { roundId });
}

// ---------------------------------------------------------------------------
// Community challenge goals
// ---------------------------------------------------------------------------

const goalsRef = collection(db, 'challengeGoals');
const challengeListRef = doc(db, 'live', 'challenges');

// A goal as the page uses it, with votingOpenedAt as milliseconds (estimated
// while the server timestamp is still on its way).
function toGoal(snap) {
  const data = snap.data({ serverTimestamps: 'estimate' });
  return { id: snap.id, ...data, votingOpenedAtMs: data.votingOpenedAt ? data.votingOpenedAt.toMillis() : null };
}

export function subscribeToChallengeGoal(goalId, onChange) {
  return onSnapshot(
    doc(goalsRef, goalId),
    (snap) => onChange(snap.exists() ? toGoal(snap) : null),
    () => onChange(null)
  );
}

// Everyone who's chipped in: [{ id (uid), username, gems, vote }].
export function subscribeToGoalDonations(goalId, onChange) {
  return onSnapshot(
    collection(db, 'challengeGoals', goalId, 'donations'),
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => onChange([])
  );
}

// Staff's list of challenges that goals pick their vote options from.
export function subscribeToChallengeList(onChange) {
  return onSnapshot(
    challengeListRef,
    (snap) => onChange(snap.exists() ? snap.data().list || [] : []),
    () => onChange([])
  );
}

export async function saveChallengeList(list) {
  await setDoc(challengeListRef, { list });
}

// A new goal takes a snapshot of the challenge list (so editing the list
// mid-goal doesn't change what can come up) and becomes the featured one.
export async function startChallengeGoal(target, pool, createdBy) {
  const ref = await addDoc(goalsRef, {
    target,
    raised: 0,
    status: 'collecting',
    pool,
    createdBy,
    createdAt: Date.now(),
  });
  await featureChallengeGoal(ref.id);
  return ref.id;
}

// null takes the goal off the live page and the overlay.
export async function featureChallengeGoal(goalId) {
  await setDoc(stateRef, { goalId }, { merge: true });
}

const donateToChallengeGoalCallable = httpsCallable(functions, 'donateToChallengeGoal');
const voteOnChallengeCallable = httpsCallable(functions, 'voteOnChallenge');
const cancelChallengeGoalCallable = httpsCallable(functions, 'cancelChallengeGoal');

// Resolves to { taken, gems, reached }: only what the goal still needed is taken.
export async function donateToChallengeGoal(goalId, amount) {
  return call(donateToChallengeGoalCallable, { goalId, amount });
}

export async function voteOnChallenge(goalId, option) {
  await call(voteOnChallengeCallable, { goalId, option });
}

// Staff: call the goal off and refund every donor.
export async function cancelChallengeGoal(goalId) {
  return call(cancelChallengeGoalCallable, { goalId });
}

// ---------------------------------------------------------------------------
// League Roulette
// ---------------------------------------------------------------------------

const spinRouletteCallable = httpsCallable(functions, 'spinRoulette');

// Resolves to { landed (league id), payout, gems (new balance) }. The server
// picks where it lands; the page only animates to it.
export async function spinRoulette(pick, amount) {
  return call(spinRouletteCallable, { pick, amount });
}

// Everyone's latest spins, newest first.
export function subscribeToRecentSpins(onChange, count = 10) {
  return onSnapshot(
    query(collection(db, 'rouletteSpins'), orderBy('at', 'desc'), limit(count)),
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => onChange([])
  );
}

// ---------------------------------------------------------------------------
// Gem drops
// ---------------------------------------------------------------------------

const dropsRef = collection(db, 'gemDrops');

function toDrop(snap) {
  const data = snap.data({ serverTimestamps: 'estimate' });
  return { id: snap.id, ...data, openedAtMs: data.openedAt ? data.openedAt.toMillis() : null };
}

export function subscribeToGemDrop(dropId, onChange) {
  return onSnapshot(
    doc(dropsRef, dropId),
    (snap) => onChange(snap.exists() ? toDrop(snap) : null),
    () => onChange(null)
  );
}

// Everyone who's claimed it: [{ id (uid), username, gems }].
export function subscribeToDropClaims(dropId, onChange) {
  return onSnapshot(
    collection(db, 'gemDrops', dropId, 'claims'),
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => onChange([])
  );
}

// Staff: start a drop straight away and put it on the page and overlay.
export async function startGemDrop(amount, seconds, createdBy) {
  const ref = await addDoc(dropsRef, {
    amount,
    durationMs: seconds * 1000,
    openedAt: serverTimestamp(),
    createdBy,
    createdAt: Date.now(),
  });
  await featureGemDrop(ref.id);
  return ref.id;
}

// null takes the drop off the live page and the overlay.
export async function featureGemDrop(dropId) {
  await setDoc(stateRef, { dropId }, { merge: true });
}

const claimGemDropCallable = httpsCallable(functions, 'claimGemDrop');

// Resolves to { amount, gems (new balance) }.
export async function claimGemDrop(dropId) {
  return call(claimGemDropCallable, { dropId });
}

// ---------------------------------------------------------------------------
// Extra lives
// ---------------------------------------------------------------------------

const lifeRunsRef = collection(db, 'lifeRuns');

// The run on screen: { id, lives, price, priceMultiplier, bought, status,
// lastBuyer, window, lastWindow }. `window` is the timed extra-life goal
// while one is open - { id, openedAtMs, ms, raised, state } - else null.
function toLifeRun(snap) {
  const data = snap.data({ serverTimestamps: 'estimate' });
  const window = data.window
    ? { ...data.window, openedAtMs: data.window.openedAt ? data.window.openedAt.toMillis() : null }
    : null;
  return { id: snap.id, ...data, window };
}

export function subscribeToLifeRun(runId, onChange) {
  return onSnapshot(
    doc(lifeRunsRef, runId),
    (snap) => onChange(snap.exists() ? toLifeRun(snap) : null),
    () => onChange(null)
  );
}

// Who's put the most Gold into a window: [{ id (uid), username, gems }].
export function subscribeToLifeWindowDonors(runId, windowId, onChange, count = 5) {
  return onSnapshot(
    query(collection(db, 'lifeRuns', runId, 'windows', windowId, 'donations'), orderBy('gems', 'desc'), limit(count)),
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => onChange([])
  );
}

// Staff: start a run and put it on the page and overlay. `price` is what the
// first extra life costs; each one after costs `priceMultiplier` times the last.
export async function startLifeRun({ lives, price, priceMultiplier }, createdBy) {
  const ref = await addDoc(lifeRunsRef, {
    lives,
    price,
    priceMultiplier,
    bought: 0,
    status: 'active',
    createdBy,
    createdAt: Date.now(),
  });
  await featureLifeRun(ref.id);
  return ref.id;
}

// null takes the run off the live page and the overlay (and failed attacks
// stop costing it lives).
export async function featureLifeRun(runId) {
  await setDoc(stateRef, { lifeRunId: runId }, { merge: true });
}

// Staff: correct the life count by hand.
export async function setLifeRunLives(runId, lives) {
  await updateDoc(doc(lifeRunsRef, runId), { lives });
}

// Staff: end the run.
export async function endLifeRun(runId) {
  await updateDoc(doc(lifeRunsRef, runId), { status: 'ended' });
}

const openLifeWindowCallable = httpsCallable(functions, 'openLifeWindow');
const closeLifeWindowCallable = httpsCallable(functions, 'closeLifeWindow');
const donateToLifeGoalCallable = httpsCallable(functions, 'donateToLifeGoal');

// Staff: open the timed extra-life goal - viewers get 5 minutes to fill the bar.
export async function openLifeWindow(runId) {
  return call(openLifeWindowCallable, { runId });
}

// Closes a window whose time is up, refunding everyone (safe for anything to
// call - the server only acts once the countdown really has run out). With
// `cancel`, staff call it off early. Resolves to { closed, refunded }.
export async function closeLifeWindow(runId, { cancel = false } = {}) {
  return call(closeLifeWindowCallable, { runId, cancel });
}

// Resolves to { taken, gems (new balance), lifeBought, lives }.
export async function donateToLifeGoal(runId, amount) {
  return call(donateToLifeGoalCallable, { runId, amount });
}
