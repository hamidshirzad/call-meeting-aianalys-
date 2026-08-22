import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/_lib/api-errors';
import {
  authenticateRequest,
  extractBearerToken,
  type VerifyIdToken,
} from '../api/_lib/firebase-auth';

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
    const verifyIdToken = vi
      .fn<VerifyIdToken>()
      .mockRejectedValue(new Error('private verifier detail'));
    const request = new Request('https://example.test/api/account', {
      headers: { authorization: 'Bearer invalid-token' },
    });

    await expect(authenticateRequest(request, verifyIdToken)).rejects.toMatchObject({
      status: 401,
      code: 'AUTH_TOKEN_INVALID',
      message: 'The Firebase ID token is invalid.',
    });
  });
});
