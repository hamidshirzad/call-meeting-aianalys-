import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('server and browser package boundary', () => {
  const entrySource = readFileSync(resolve('index.tsx'), 'utf8');
  const appSource = readFileSync(resolve('App.tsx'), 'utf8');

  it('does not import Firebase Admin into the browser entry graph', () => {
    expect(entrySource).not.toContain('firebase-admin');
    expect(appSource).not.toContain('firebase-admin');
  });

  it('does not initialize Statsig with a shared identity', () => {
    expect(entrySource).not.toContain('Statsig');
    expect(entrySource).not.toContain('userID');
  });
});
