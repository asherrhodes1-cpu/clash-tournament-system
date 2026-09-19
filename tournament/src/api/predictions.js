import { collection, collectionGroup, doc, getDoc, setDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

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

// Running totals per player per tournament, kept up to date by the scoring
// function: [{ tournamentId, username, correct, total }].
export function subscribeToPredictionScores(onChange) {
  return onSnapshot(
    collectionGroup(db, 'predictionScores'),
    (snap) => onChange(snap.docs.map((d) => ({ tournamentId: d.ref.parent.parent.id, ...d.data() }))),
    () => onChange([])
  );
}
