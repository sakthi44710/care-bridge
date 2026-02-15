import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, setPersistence, browserSessionPersistence, User } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

// Use session persistence: survives page reloads but clears on browser/tab close
setPersistence(auth, browserSessionPersistence).catch((err) =>
  console.error('Failed to set auth persistence:', err)
);

// Configure Google Provider
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

export { app, auth, db, googleProvider };

// Auth utilities
export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error: any) {
    console.error('Google sign-in error:', error);
    throw error;
  }
};

export const signOutUser = async () => {
  try {
    await signOut(auth);
  } catch (error: any) {
    console.error('Sign out error:', error);
    throw error;
  }
};

export const onAuthChange = (callback: (user: User | null) => void) => {
  return onAuthStateChanged(auth, callback);
};

export const getCurrentUser = () => auth.currentUser;

export const getIdToken = async (forceRefresh = false): Promise<string | null> => {
  const user = auth.currentUser;
  if (user) {
    return await user.getIdToken(forceRefresh);
  }
  return null;
};

// ── Firestore User Management (client-side fallback) ────
const ADMIN_EMAILS = ['sakthiprakashthangaraj@gmail.com', 'kirthidass.m@gmail.com'];

export const getUserFromFirestore = async (uid: string) => {
  try {
    const userDoc = await getDoc(doc(db, 'users', uid));
    if (userDoc.exists()) {
      return { id: uid, ...userDoc.data() };
    }
    return null;
  } catch (error) {
    console.error('Firestore read error:', error);
    return null;
  }
};

export const createUserInFirestore = async (user: User) => {
  const isAdmin = ADMIN_EMAILS.includes(user.email || '');
  const userData = {
    email: user.email,
    name: user.displayName,
    photo_url: user.photoURL,
    role: isAdmin ? 'admin' : '',
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  };
  try {
    await setDoc(doc(db, 'users', user.uid), userData);
    return { id: user.uid, ...userData };
  } catch (error) {
    console.error('Firestore write error:', error);
    return { id: user.uid, ...userData };
  }
};

export const updateUserRoleInFirestore = async (uid: string, role: string) => {
  try {
    await setDoc(doc(db, 'users', uid), {
      role,
      updated_at: serverTimestamp(),
    }, { merge: true });
    return true;
  } catch (error) {
    console.error('Firestore update error:', error);
    return false;
  }
};

export const submitVerificationToFirestore = async (uid: string, data: any) => {
  try {
    await setDoc(doc(db, 'users', uid), {
      ...data,
      verification_status: 'pending',
      updated_at: serverTimestamp(),
    }, { merge: true });
    return true;
  } catch (error) {
    console.error('Firestore verification update error:', error);
    return false;
  }
};
