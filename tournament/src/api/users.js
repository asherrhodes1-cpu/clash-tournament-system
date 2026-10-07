import { collection, query, where, onSnapshot, doc, updateDoc, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';

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

const createDiscordLinkCodeCallable = httpsCallable(functions, 'createDiscordLinkCode');

export async function createDiscordLinkCode() {
  const result = await createDiscordLinkCodeCallable();
  return result.data;
}

// Staff: every account, for the user search - [{ id (uid), username,
// clashTag, createdAt, isStaff, clashVerified, discordId }]. Loaded once
// on demand rather than kept live; names are matched in the browser so a
// search can find text anywhere in a name, not just at the start.
export async function fetchAllUsers() {
  const snap = await getDocs(collection(db, 'users'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

const removeUserCallable = httpsCallable(functions, 'removeUser');

// Staff: delete an account outright (see removeUser in functions/index.js).
// Resolves to { username, signupsRemoved }.
export async function removeUser(uid) {
  try {
    return (await removeUserCallable({ uid })).data;
  } catch (err) {
    if (err.code === 'functions/internal' || err.code === 'functions/unavailable') {
      throw new Error('Couldn\'t reach the server - try again in a moment.');
    }
    throw err;
  }
}

const renameUserCallable = httpsCallable(functions, 'renameUser');

// Staff: give an account a new username everywhere (see renameUser in
// functions/index.js). Resolves to { from, to, tournaments, matches }.
export async function renameUser(uid, newUsername) {
  try {
    return (await renameUserCallable({ uid, newUsername })).data;
  } catch (err) {
    if (err.code === 'functions/internal' || err.code === 'functions/unavailable') {
      throw new Error('Couldn\'t reach the server - try again in a moment.');
    }
    throw err;
  }
}
