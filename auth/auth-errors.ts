import { FirebaseError } from 'firebase/app';

const messages: Record<string, string> = {
  'auth/account-exists-with-different-credential':
    'An account already exists with this email address. Sign in using the original method.',
  'auth/api-key-not-valid':
    'The Firebase browser API key is invalid. Check the Vercel Firebase settings and redeploy.',
  'auth/app-not-authorized':
    'This app is not authorized to use Firebase Authentication. Check the Firebase API-key restrictions.',
  'auth/configuration-not-found':
    'Firebase Authentication is not configured for this project. Enable the selected sign-in method in Firebase.',
  'auth/email-already-in-use': 'An account already exists for this email address.',
  'auth/internal-error':
    'Firebase Authentication returned an internal error. Please try again in a moment.',
  'auth/invalid-api-key':
    'The Firebase browser API key is invalid. Check the Vercel Firebase settings and redeploy.',
  'auth/invalid-credential': 'The email or password is incorrect.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/missing-password': 'Enter your password.',
  'auth/network-request-failed':
    'The authentication request could not reach Firebase. Check your connection and try again.',
  'auth/operation-not-allowed':
    'This sign-in method is not enabled in Firebase Authentication.',
  'auth/popup-blocked': 'Your browser blocked the Google sign-in window. Allow pop-ups and try again.',
  'auth/popup-closed-by-user': 'Google sign-in was cancelled before it finished.',
  'auth/too-many-requests': 'Too many attempts. Wait a moment before trying again.',
  'auth/unauthorized-domain': 'This domain is not authorized in Firebase Authentication.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/weak-password': 'Use a password with at least six characters.',
  'auth/web-storage-unsupported':
    'This browser is blocking the storage Firebase needs for sign-in. Allow website storage and try again.',
};

export function getHumanAuthError(error: unknown): string {
  if (error instanceof FirebaseError) {
    return messages[error.code] ?? `Authentication could not be completed (${error.code}).`;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Authentication could not be completed. Please try again.';
}
