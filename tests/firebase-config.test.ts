import { describe, expect, it } from 'vitest';
import {
  normalizeFirebaseAuthDomain,
  normalizeFirebaseEnvironmentValue,
} from '../lib/firebase';

describe('Firebase browser configuration normalization', () => {
  it('removes whitespace, copied quotes, and a snippet comma', () => {
    expect(normalizeFirebaseEnvironmentValue('  "public-value",  ')).toBe('public-value');
    expect(normalizeFirebaseEnvironmentValue("  'public-value'  ")).toBe('public-value');
  });

  it('normalizes a Firebase auth URL to the required hostname', () => {
    expect(normalizeFirebaseAuthDomain(' https://fourdoor-call-coach.firebaseapp.com/ ')).toBe(
      'fourdoor-call-coach.firebaseapp.com',
    );
    expect(normalizeFirebaseAuthDomain('"fourdoor-call-coach.firebaseapp.com",')).toBe(
      'fourdoor-call-coach.firebaseapp.com',
    );
  });

  it('rejects auth domains containing a path, query, or invalid URL', () => {
    expect(normalizeFirebaseAuthDomain('fourdoor-call-coach.firebaseapp.com/not-allowed')).toBe(
      undefined,
    );
    expect(normalizeFirebaseAuthDomain('fourdoor-call-coach.firebaseapp.com?bad=1')).toBe(undefined);
    expect(normalizeFirebaseAuthDomain('not a hostname')).toBe(undefined);
  });
});
