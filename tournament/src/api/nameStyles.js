import { doc, onSnapshot, setDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '../firebase';

// Golden names: who has one lives in a single public doc
// (live/nameStyles: { gold: [usernameLower] }) so it shows for everyone,
// signed in or not. Staff edit it from the Users panel; renameUser moves an
// entry when a golden player is renamed.
const stylesRef = doc(db, 'live', 'nameStyles');

// Calls onChange with the usernames (lowercase) that have a golden name.
export function subscribeToGoldNames(onChange) {
  return onSnapshot(
    stylesRef,
    (snap) => onChange(snap.exists() ? snap.data().gold || [] : []),
    () => onChange([])
  );
}

// Staff: give a player the golden name, or take it away.
export async function setGoldName(username, on) {
  const key = username.toLowerCase();
  await setDoc(stylesRef, { gold: on ? arrayUnion(key) : arrayRemove(key) }, { merge: true });
}
