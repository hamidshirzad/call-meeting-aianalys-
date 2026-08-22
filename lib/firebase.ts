import { getApp, getApps, initializeApp, type FirebaseOptions } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';

export function normalizeFirebaseEnvironmentValue(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  let normalized = value.trim();
  if (normalized.endsWith(',')) {
    normalized = normalized.slice(0, -1).trim();
  }

  const firstCharacter = normalized.at(0);
  const lastCharacter = normalized.at(-1);
  if (
    normalized.length >= 2 &&
    (firstCharacter === '"' || firstCharacter === "'") &&
    lastCharacter === firstCharacter
  ) {
    normalized = normalized.slice(1, -1).trim();
  }

  return normalized.length > 0 ? normalized : undefined;
}

export function normalizeFirebaseAuthDomain(value: unknown): string | undefined {
  const normalized = normalizeFirebaseEnvironmentValue(value);
  if (!normalized) {
    return undefined;
  }

  const candidate = /^https?:\/\//i.test(normalized) ? normalized : `https://${normalized}`;

  try {
    const url = new URL(candidate);
    const hasUnexpectedParts =
      !['http:', 'https:'].includes(url.protocol) ||
      url.username.length > 0 ||
      url.password.length > 0 ||
      (url.pathname !== '' && url.pathname !== '/') ||
      url.search.length > 0 ||
      url.hash.length > 0;

    return hasUnexpectedParts || url.hostname.length === 0 ? undefined : url.host;
  } catch {
    return undefined;
  }
}

export const firebaseConfig: FirebaseOptions = {
  apiKey: normalizeFirebaseEnvironmentValue(import.meta.env.VITE_FIREBASE_API_KEY),
  authDomain: normalizeFirebaseAuthDomain(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN),
  projectId: normalizeFirebaseEnvironmentValue(import.meta.env.VITE_FIREBASE_PROJECT_ID),
  storageBucket: normalizeFirebaseEnvironmentValue(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: normalizeFirebaseEnvironmentValue(
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  ),
  appId: normalizeFirebaseEnvironmentValue(import.meta.env.VITE_FIREBASE_APP_ID),
};

const missingConfiguration = Object.entries(firebaseConfig)
  .filter(([, value]) => typeof value !== 'string' || value.length === 0)
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
