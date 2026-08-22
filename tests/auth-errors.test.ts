import { FirebaseError } from 'firebase/app';
import { describe, expect, it } from 'vitest';
import { getHumanAuthError } from '../auth/auth-errors';

describe('Firebase browser authentication errors', () => {
  it('explains when a sign-in method is disabled', () => {
    const error = new FirebaseError(
      'auth/operation-not-allowed',
      'private provider configuration detail',
    );

    expect(getHumanAuthError(error)).toBe(
      'This sign-in method is not enabled in Firebase Authentication.',
    );
  });

  it('surfaces an unknown Firebase code without its private message', () => {
    const error = new FirebaseError('auth/example-unknown-code', 'private Firebase detail');
    const message = getHumanAuthError(error);

    expect(message).toBe('Authentication could not be completed (auth/example-unknown-code).');
    expect(message).not.toContain('private Firebase detail');
  });

  it('does not expose a Firebase message for known configuration failures', () => {
    const error = new FirebaseError('auth/configuration-not-found', 'private project detail');
    const message = getHumanAuthError(error);

    expect(message).toBe(
      'Firebase Authentication is not configured for this project. Enable the selected sign-in method in Firebase.',
    );
    expect(message).not.toContain('private project detail');
  });
});
