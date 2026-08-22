import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Firebase Storage upload rules', () => {
  const rules = readFileSync(resolve('storage.rules'), 'utf8');

  it('allows only authenticated UID-scoped audio creation up to 50 MB', () => {
    expect(rules).toContain('match /users/{uid}/uploads/{fileName}');
    expect(rules).toContain('request.auth.uid == uid');
    expect(rules).toContain('request.resource.size <= 50 * 1024 * 1024');
    expect(rules).toContain("request.resource.contentType.matches(");
  });

  it('denies browser reads, overwrites, deletion and every other path', () => {
    expect(rules).toContain('allow read, update, delete: if false;');
    expect(rules).toContain('match /{path=**}');
    expect(rules).toContain('allow read, write: if false;');
  });
});
