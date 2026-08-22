import { FirebaseError } from 'firebase/app';

const messages: Record<string, string> = {
  'auth/email-already-in-use': 'An account already exists for this email address.',
  'auth/invalid-credential': 'The email or password is incorrect.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/missing-password': 'Enter your password.',
  'auth/popup-blocked': 'Your browser blocked the Google sign-in window. Allow pop-ups and try again.',
  'auth/popup-closed-by-user': 'Google sign-in was cancelled before it finished.',
  'auth/too-many-requests': 'Too many attempts. Wait a moment before trying again.',
  'auth/unauthorized-domain': 'This domain is not authorized in Firebase Authentication.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/weak-password': 'Use a password with at least six characters.',
};

export function getHumanAuthError(error: unknown): string {
  if (error instanceof FirebaseError) {
    return messages[error.code] ?? 'Authentication could not be completed. Please try again.';
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Authentication could not be completed. Please try again.';
}
