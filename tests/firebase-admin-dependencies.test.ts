import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Firebase Admin serverless dependency compatibility', () => {
  it('pins jwks-rsa to a CommonJS-compatible jose release', () => {
    const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as {
      overrides?: { 'jwks-rsa'?: { jose?: string } };
    };

    expect(packageJson.overrides?.['jwks-rsa']?.jose).toBe('4.15.9');

    const requireFromJwksRsa = createRequire(resolve('node_modules/jwks-rsa/src/utils.js'));
    const installedVersion = (requireFromJwksRsa('jose/package.json') as { version: string })
      .version;
    const jose = requireFromJwksRsa('jose') as { importJWK?: unknown; exportSPKI?: unknown };

    expect(installedVersion).toBe('4.15.9');
    expect(jose.importJWK).toBeTypeOf('function');
    expect(jose.exportSPKI).toBeTypeOf('function');
  });
});
