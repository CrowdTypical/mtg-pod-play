import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

import { auth, db } from '@/config/firebase';
import type { UserProfile } from '@/types';

/* --------------------------------------------------------
 * Account creation & auth
 * -------------------------------------------------------- */

export async function signUp(
  email: string,
  password: string,
  displayName: string,
): Promise<UserProfile> {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  const user = cred.user;

  // Set Firebase Auth display name.
  await updateProfile(user, { displayName });

  // Create the Firestore user profile doc.
  const profile: UserProfile = {
    uid: user.uid,
    email: user.email,
    displayName,
    nickname: null, // User can add later; null is Firestore-safe
    createdAt: null, // serverTimestamp resolves server-side
  };
  await setDoc(doc(db, 'users', user.uid), {
    ...profile,
    createdAt: serverTimestamp(),
  });

  return { ...profile, createdAt: null };
}

export async function logIn(email: string, password: string): Promise<User> {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function logOut(): Promise<void> {
  await signOut(auth);
}

export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}

/* --------------------------------------------------------
 * Profile management
 * -------------------------------------------------------- */

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  return snap.data() as UserProfile;
}

export async function updateUserNickname(uid: string, nickname: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { nickname });
}

export async function updateUserDisplayName(
  uid: string,
  newDisplayName: string,
): Promise<void> {
  const user = auth.currentUser;
  if (user) {
    await updateProfile(user, { displayName: newDisplayName });
  }
  await updateDoc(doc(db, 'users', uid), { displayName: newDisplayName });
}

/** Convert a Firebase Auth User into our UserProfile (creating the doc if missing). */
export async function ensureUserProfile(user: User): Promise<UserProfile> {
  const existing = await getUserProfile(user.uid);
  if (existing) return existing;

  // Auto-create a profile if one doesn't exist yet (e.g., legacy auth user).
  const profile: UserProfile = {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName ?? user.email?.split('@')[0] ?? 'Player',
    nickname: null,
    createdAt: null,
  };
  await setDoc(doc(db, 'users', user.uid), {
    ...profile,
    createdAt: serverTimestamp(),
  });
  return profile;
}