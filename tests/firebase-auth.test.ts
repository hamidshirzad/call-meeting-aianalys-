import { describe, expect, it, vi } from 'vitest';
import { ApiError, ServerConfigurationError } from '../api/_lib/api-errors';
import {
  authenticateRequest,
  createFirebaseAuthDiagnostic,
  extractBearerToken,
  type VerifyIdToken,
} from '../api/_lib/firebase-auth';

function createUnsignedToken(payload: Record<string, unknown>): string {
  return `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;
}

describe('Firebase ID-token authentication', () => {
  it('rejects missing and malformed bearer headers', () => {
    expect(() => extractBearerToken(null)).toThrowError(ApiError);
    expect(() => extractBearerToken('Basic abc')).toThrowError(ApiError);
    expect(() => extractBearerToken('Bearer')).toThrowError(ApiError);
    expect(() => extractBearerToken('Bearer one two')).toThrowError(ApiError);
  });

  it('extracts a bounded bearer token', () => {
    expect(extractBearerToken('Bearer firebase-token')).toBe('firebase-token');
    expect(() => extractBearerToken(`Bearer ${'x'.repeat(8193)}`)).toThrowError(ApiError);
  });

  it('verifies revocation and derives identity only from token claims', async () => {
    const verifyIdToken = vi.fn<VerifyIdToken>().mockResolvedValue({
      uid: 'firebase-uid',
      email: 'owner@example.com',
      email_verified: true,
      name: 'Owner',
    });
    const request = new Request('https://example.test/api/account?uid=attacker', {
      headers: { authorization: 'Bearer firebase-token' },
    });

    await expect(authenticateRequest(request, verifyIdToken)).resolves.toEqual({
      uid: 'firebase-uid',
      email: 'owner@example.com',
      emailVerified: true,
      displayName: 'Owner',
    });
    expect(verifyIdToken).toHaveBeenCalledWith('firebase-token', true);
  });

  it('returns one safe authentication error for verifier failures', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const verifyIdToken = vi
      .fn<VerifyIdToken>()
      .mockRejectedValue(
        Object.assign(new Error('private verifier detail'), { code: 'auth/argument-error' }),
      );
    const request = new Request('https://example.test/api/account', {
      headers: { authorization: 'Bearer invalid-token' },
    });

    await expect(authenticateRequest(request, verifyIdToken)).rejects.toMatchObject({
      status: 401,
      code: 'AUTH_TOKEN_INVALID',
      message: 'The Firebase ID token is invalid.',
    });
    expect(errorSpy).toHaveBeenCalledWith('[api] Firebase ID token rejected', {
      verifierCode: 'auth/argument-error',
      tokenAudiencePresent: false,
      audienceMatchesConfiguredProject: null,
    });
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('private verifier detail');
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('invalid-token');
  });

  it('reports only whether the token audience matches the configured project', () => {
    vi.stubEnv('FIREBASE_PROJECT_ID', 'fourdoor-call-coach');
    const token = createUnsignedToken({
      aud: 'fourdoor-call-coach',
      email: 'private@example.com',
      user_id: 'private-uid',
    });

    const diagnostic = createFirebaseAuthDiagnostic(
      Object.assign(new Error('certificate detail'), { code: 'auth/id-token-expired' }),
      token,
    );

    expect(diagnostic).toEqual({
      verifierCode: 'auth/id-token-expired',
      tokenAudiencePresent: true,
      audienceMatchesConfiguredProject: true,
    });
    expect(JSON.stringify(diagnostic)).not.toContain('fourdoor-call-coach');
    expect(JSON.stringify(diagnostic)).not.toContain('private@example.com');
    expect(JSON.stringify(diagnostic)).not.toContain('private-uid');
    expect(JSON.stringify(diagnostic)).not.toContain('certificate detail');
  });

  it('detects a Firebase project mismatch without logging either project ID', () => {
    vi.stubEnv('FIREBASE_PROJECT_ID', 'fourdoor-call-coach');
    const diagnostic = createFirebaseAuthDiagnostic(
      { code: 'auth/argument-error' },
      createUnsignedToken({ aud: 'different-project' }),
    );

    expect(diagnostic).toEqual({
      verifierCode: 'auth/argument-error',
      tokenAudiencePresent: true,
      audienceMatchesConfiguredProject: false,
    });
    expect(JSON.stringify(diagnostic)).not.toContain('different-project');
    expect(JSON.stringify(diagnostic)).not.toContain('fourdoor-call-coach');
  });

  it('preserves server configuration failures for a 503 response', async () => {
    const verifyIdToken = vi
      .fn<VerifyIdToken>()
      .mockRejectedValue(new ServerConfigurationError(['FIREBASE_PROJECT_ID']));
    const request = new Request('https://example.test/api/account', {
      headers: { authorization: 'Bearer token' },
    });

    await expect(authenticateRequest(request, verifyIdToken)).rejects.toBeInstanceOf(
      ServerConfigurationError,
    );
  });
});
