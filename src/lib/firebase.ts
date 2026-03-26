import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAnalytics, isSupported } from 'firebase/analytics';
import { getAuth, GoogleAuthProvider, Auth } from 'firebase/auth';

const apiKey = import.meta.env.VITE_FIREBASE_API_KEY as string | undefined;
const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined;
const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined;
const appId = import.meta.env.VITE_FIREBASE_APP_ID as string | undefined;

// Firebase requires at minimum apiKey, authDomain, projectId, and appId.
// If they are not set yet the app must still render — we guard initialization
// here so a missing .env doesn't crash the entire React tree.
export const isFirebaseConfigured = Boolean(apiKey && authDomain && projectId && appId);

// In development, log which env vars are missing so misconfiguration is
// immediately visible in the browser console rather than producing a
// silent "Firebase not configured" state.
if (import.meta.env.DEV && !isFirebaseConfigured) {
  const missing = (
    [
      ['VITE_FIREBASE_API_KEY', apiKey],
      ['VITE_FIREBASE_AUTH_DOMAIN', authDomain],
      ['VITE_FIREBASE_PROJECT_ID', projectId],
      ['VITE_FIREBASE_APP_ID', appId],
    ] as [string, string | undefined][]
  )
    .filter(([, v]) => !v)
    .map(([k]) => k);
  console.warn('[Firebase] Missing env vars:', missing.join(', '));
}

let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _googleProvider: GoogleAuthProvider | null = null;

if (isFirebaseConfigured) {
  const firebaseConfig = {
    apiKey,
    authDomain,
    projectId,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
  };

  _app = initializeApp(firebaseConfig);
  _auth = getAuth(_app);
  _googleProvider = new GoogleAuthProvider();

  // Analytics is optional and only works in supported browser environments
  isSupported().then((supported) => {
    if (supported && _app) {
      getAnalytics(_app);
    }
  });
}

export const auth = _auth;
export const googleProvider = _googleProvider;
export default _app;
