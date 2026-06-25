import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/** Base URL for generating shareable links (join, overlay). Defaults to localhost. */
export const APP_BASE_URL: string =
  import.meta.env.VITE_APP_BASE_URL || 'http://localhost:5173';

// Validate that required config is present.
function validateConfig(): void {
  const missing = Object.entries(firebaseConfig)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length > 0) {
    console.warn(
      `[firebase] Missing environment variables: ${missing.join(', ')}.\n` +
        'Copy .env.example to .env.local and fill in your Firebase config.',
    );
  }
}
validateConfig();

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;

try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
} catch (err) {
  console.error('[firebase] Initialization failed:', err);
  // Re-throw so callers know Firebase isn't ready. This typically only
  // happens with truly invalid config.
  throw err;
}

export { app, auth, db };