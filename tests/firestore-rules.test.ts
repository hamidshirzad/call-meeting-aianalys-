import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('initial Firestore rules', () => {
  const rules = readFileSync(resolve('firestore.rules'), 'utf8');

  it('limits user reads to the authenticated owner', () => {
    expect(rules).toContain('request.auth.uid == uid');
    expect(rules).toContain('allow read: if isOwner(uid);');
    expect(rules).toContain('match /reports/{reportId}');
    expect(rules).toContain('match /usage/{documentId}');
  });

  it('denies browser writes to profiles, reports, usage and Stripe events', () => {
    expect(rules).toContain('allow create, update, delete: if false;');
    expect(rules).toContain('match /stripeEvents/{eventId}');
    expect(rules).toContain('allow read, write: if false;');
  });

  it('ends with a default deny rule', () => {
    expect(rules).toContain('match /{document=**}');
  });
});
