import { collection, collectionGroup, doc, getDoc, setDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';

function predictionsRef(tournamentId, matchId) {
  return collection(db, 'tournaments', String(tournamentId), 'matches', matchId, 'predictions');
}

// Every prediction on a match: [{ id (the voter's uid), username, pick, correct }].
export function subscribeToMatchPredictions(tournamentId, matchId, onChange) {
  return onSnapshot(
    predictionsRef(tournamentId, matchId),
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => onChange([])
  );
}

// One prediction per player per match. The rules only allow this while the
// match is still pending and the voter isn't one of its players.
export async function submitPrediction(match, user, pick) {
  const ref = doc(predictionsRef(match.tournamentId, match.id), user.uid);
  const existing = await getDoc(ref);
  // Changing a pick may only touch `pick` (the rules), so it's an update.
  if (existing.exists()) await updateDoc(ref, { pick });
  else await setDoc(ref, { username: user.username, pick, createdAt: Date.now() });
}

// One tournament's running totals per player, kept up to date by the scoring
// function: [{ username, correct, total }].
export function subscribeToTournamentPredictionScores(tournamentId, onChange) {
  return onSnapshot(
    collection(db, 'tournaments', String(tournamentId), 'predictionScores'),
    (snap) => onChange(snap.docs.map((d) => d.data())),
    () => onChange([])
  );
}

const setPredictionsStartDayCallable = httpsCallable(functions, 'setPredictionsStartDay');

// Staff: only count predictions from this day on, recalculating the
// tournament's leaderboard. Votes are never deleted, so this can be changed back.
export async function setPredictionsStartDay(tournamentId, fromDay) {
  const result = await setPredictionsStartDayCallable({ tournamentId, fromDay });
  return result.data;
}
