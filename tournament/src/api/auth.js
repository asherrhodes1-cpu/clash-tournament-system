import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '../firebase';

const EMAIL_DOMAIN = 'clash-tournament.local';

function usernameToEmail(username) {
  return `${username.trim().toLowerCase()}@${EMAIL_DOMAIN}`;
}

const signUpCallable = httpsCallable(functions, 'signUp');
const adminResetPasswordCallable = httpsCallable(functions, 'adminResetPassword');

export async function signUp({ username, password, clashTag, inviteCode }) {
  await signUpCallable({ username, password, clashTag, inviteCode: inviteCode || null });
  await signInWithEmailAndPassword(auth, usernameToEmail(username), password);
}

export async function logIn({ username, password }) {
  try {
    await signInWithEmailAndPassword(auth, usernameToEmail(username), password);
  } catch (err) {
    throw new Error('Invalid username or password');
  }
}

export function logOut() {
  return signOut(auth);
}

export function adminResetPassword({ username, newPassword }) {
  return adminResetPasswordCallable({ username, newPassword });
}

// Subscribes to auth state and calls onChange with either null (signed out) or
// { username, clashTag, isStaff } matching the shape the rest of the app expects.
export function subscribeToAuthState(onChange) {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      onChange(null);
      return;
    }

    const tokenResult = await user.getIdTokenResult();
    const username = tokenResult.claims.username;
    const isStaff = !!tokenResult.claims.isStaff;

    const userDoc = await getDoc(doc(db, 'users', user.uid));
    const clashTag = userDoc.exists() ? userDoc.data().clashTag : '';

    onChange({ username, clashTag, isStaff });
  });
}
