import { collection, doc, onSnapshot, query, where, orderBy, limit } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';

// The 1v1 ladder. Its matches are ordinary match docs under
// tournaments/ladder, so readying up, reporting and chat go through
// api/tournaments.js with this id; what's here is the queue and the ratings.
export const LADDER_ID = 'ladder';

// Enough of a tournament for the match components that expect one.
export const LADDER_TOURNAMENT = { id: LADDER_ID, kind: 'ladder', name: '1v1 Ladder', format: 'ladder', players: [] };

const ratingsRef = collection(db, 'ladderRatings');
const queueRef = collection(db, 'ladderQueue');
const ladderMatchesRef = collection(db, 'tournaments', LADDER_ID, 'matches');

// The leaderboard: [{ username, rating, games, wins, losses }], best first.
export function subscribeToLadderLeaderboard(onChange, count = 50) {
  return onSnapshot(
    query(ratingsRef, orderBy('rating', 'desc'), limit(count)),
    (snap) => onChange(snap.docs.map((d) => d.data())),
    () => onChange([])
  );
}

// One player's rating, or null if they haven't finished a 1v1 yet.
export function subscribeToLadderRating(username, onChange) {
  return onSnapshot(
    doc(ratingsRef, username.toLowerCase()),
    (snap) => onChange(snap.exists() ? snap.data() : null),
    () => onChange(null)
  );
}

// Everyone waiting for a match: [{ uid, username, rating, joinedAt }].
// Signed-in only (the rules), so guests just get an empty list.
export function subscribeToLadderQueue(onChange) {
  return onSnapshot(
    queueRef,
    (snap) => onChange(snap.docs.map((d) => d.data())),
    () => onChange([])
  );
}

// The latest finished 1v1s, newest first.
export function subscribeToRecentLadderResults(onChange, count = 15) {
  return onSnapshot(
    query(ladderMatchesRef, orderBy('completedAt', 'desc'), limit(count)),
    (snap) => onChange(snap.docs.map((d) => d.data()).filter((m) => m.status === 'completed')),
    () => onChange([])
  );
}

// Staff: 1v1s waiting on a decision (players disagreed, or nobody reported).
export function subscribeToLadderReviewMatches(onChange) {
  return onSnapshot(
    query(ladderMatchesRef, where('status', 'in', ['disputed', 'needs_staff_review'])),
    (snap) => onChange(snap.docs.map((d) => d.data())),
    () => onChange([])
  );
}

const joinLadderQueueCallable = httpsCallable(functions, 'joinLadderQueue');
const leaveLadderQueueCallable = httpsCallable(functions, 'leaveLadderQueue');

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

// Resolves to { matched: true, matchId, opponent } if someone suitable was
// already waiting, or { matched: false } if you're now in the queue.
export function joinLadderQueue() {
  return call(joinLadderQueueCallable, {});
}

export function leaveLadderQueue() {
  return call(leaveLadderQueueCallable, {});
}
