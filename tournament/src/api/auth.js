import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '../firebase';

const EMAIL_DOMAIN = 'clash-tournament.local';

function usernameToEmail(username) {
  return `${username.trim().toLowerCase()}@${EMAIL_DOMAIN}`;
}

const signUpCallable = httpsCallable(functions, 'signUp');
const adminResetPasswordCallable = httpsCallable(functions, 'adminResetPassword');

export async function signUp({ username, password, clashTag, apiToken, inviteCode }) {
  await signUpCallable({ username, password, clashTag, apiToken, inviteCode: inviteCode || null });
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
// { uid, username, clashTag, isStaff, builderHallLevel, bestBuilderBaseTrophies,
// clashVerified, discordId } matching the shape the rest of the app expects. Stays live
// on the user's own Firestore doc so re-verifying a Clash account updates
// immediately without needing to log back in.
export function subscribeToAuthState(onChange) {
  let unsubscribeDoc = null;

  const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
    if (unsubscribeDoc) {
      unsubscribeDoc();
      unsubscribeDoc = null;
    }

    if (!user) {
      onChange(null);
      return;
    }

    const tokenResult = await user.getIdTokenResult();
    const username = tokenResult.claims.username;
    const isStaff = !!tokenResult.claims.isStaff;

    unsubscribeDoc = onSnapshot(doc(db, 'users', user.uid), (snap) => {
      const data = snap.exists() ? snap.data() : {};
      onChange({
        uid: user.uid,
        username,
        isStaff,
        clashTag: data.clashTag || '',
        clashVerified: !!data.clashVerified,
        builderHallLevel: data.builderHallLevel ?? null,
        bestBuilderBaseTrophies: data.bestBuilderBaseTrophies ?? null,
        discordId: data.discordId || '',
      });
    });
  });

  return () => {
    unsubscribeAuth();
    if (unsubscribeDoc) unsubscribeDoc();
  };
}
