import { getApp, getApps, initializeApp, type FirebaseOptions } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';

const firebaseConfig: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const missingConfiguration = Object.entries(firebaseConfig)
  .filter(([, value]) => typeof value !== 'string' || value.trim().length === 0)
  .map(([key]) => key);

export const firebaseConfigurationError =
  missingConfiguration.length > 0
    ? `Firebase Authentication is not configured. Missing browser-safe settings: ${missingConfiguration.join(', ')}.`
    : null;

function createAuth(): Auth | null {
  if (firebaseConfigurationError) {
    return null;
  }

  const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  return getAuth(app);
}

export const firebaseAuth = createAuth();
