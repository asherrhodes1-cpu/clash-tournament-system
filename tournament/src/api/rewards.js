import { collection, doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';

const dispenseRewardsCallable = httpsCallable(functions, 'dispenseRewards');

// rewards: [{ username, link }]. Resolves to the delivery result per player.
export async function dispenseRewards(tournamentId, rewards) {
  const result = await dispenseRewardsCallable({ tournamentId, rewards });
  return result.data.results;
}

// The player's own reward, or null. Rules only let the player and staff read
// these, so a denied read simply means "no reward for you".
export function subscribeToMyReward(tournamentId, username, onChange) {
  return onSnapshot(
    doc(db, 'tournaments', String(tournamentId), 'rewards', username.toLowerCase()),
    (snap) => onChange(snap.exists() ? snap.data() : null),
    () => onChange(null)
  );
}

// Staff: every reward given out for a tournament, keyed by lowercase username.
export function subscribeToRewards(tournamentId, onChange) {
  return onSnapshot(
    collection(db, 'tournaments', String(tournamentId), 'rewards'),
    (snap) => {
      const byUser = {};
      snap.docs.forEach((d) => { byUser[d.id] = d.data(); });
      onChange(byUser);
    },
    () => onChange({})
  );
}
