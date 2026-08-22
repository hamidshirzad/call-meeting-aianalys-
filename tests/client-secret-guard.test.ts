import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  findForbiddenClientSecretReferences,
  scanClientSources,
} from '../scripts/client-secret-guard.mjs';

describe('client secret guard', () => {
  it.each([
    'process.env.GEMINI_API_KEY',
    'process.env["STRIPE_SECRET_KEY"]',
    "process.env['STRIPE_WEBHOOK_SECRET']",
    'import.meta.env.OPENAI_API_KEY',
    'import.meta.env["FIREBASE_SERVICE_ACCOUNT"]',
    "import.meta.env['DATABASE_URL']",
    'import.meta.env.VITE_GEMINI_API_KEY',
    'const alias = "VITE_STRIPE_SECRET_KEY"',
  ])('rejects %s', (source) => {
    expect(findForbiddenClientSecretReferences(source)).not.toHaveLength(0);
  });

  it('allows Firebase browser configuration identifiers', () => {
    expect(
      findForbiddenClientSecretReferences('import.meta.env.VITE_FIREBASE_API_KEY'),
    ).toEqual([]);
  });

  it('finds no forbidden secret references in client-accessible source', () => {
    expect(scanClientSources()).toEqual([]);
  });

  it('does not inject environment secrets through Vite define configuration', () => {
    const source = readFileSync(resolve('vite.config.ts'), 'utf8');
    expect(source).not.toContain('loadEnv');
    expect(source).not.toContain('define:');
    expect(source).not.toContain('process.env');
  });
});
