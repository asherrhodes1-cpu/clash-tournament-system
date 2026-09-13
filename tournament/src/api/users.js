import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

export function subscribeToUserProfile(username, onChange) {
  const usernameLower = username.trim().toLowerCase();
  const q = query(collection(db, 'users'), where('usernameLower', '==', usernameLower));
  return onSnapshot(q, (snapshot) => {
    onChange(snapshot.empty ? null : { id: snapshot.docs[0].id, ...snapshot.docs[0].data() });
  });
}

export async function updateProfile(uid, updates) {
  await updateDoc(doc(db, 'users', uid), updates);
}
