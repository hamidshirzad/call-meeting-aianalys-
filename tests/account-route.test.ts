import { describe, expect, it, vi } from 'vitest';
import {
  handleAccountRequest,
  type AccountHandlerDependencies,
} from '../api/account';
import { ServerConfigurationError } from '../api/_lib/api-errors';
import type { UserProfile } from '../api/_lib/user-profile-repository';

const profile: UserProfile = {
  uid: 'verified-uid',
  email: 'owner@example.com',
  emailVerified: true,
  displayName: 'Owner',
  plan: 'free',
  subscriptionStatus: 'none',
  entitled: false,
  hasBillingAccount: false,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  createdAt: null,
  updatedAt: null,
};

function createDependencies(): AccountHandlerDependencies {
  return {
    verifyIdToken: vi.fn().mockResolvedValue({
      uid: 'verified-uid',
      email: 'owner@example.com',
      email_verified: true,
      name: 'Owner',
    }),
    getOrCreateProfile: vi.fn().mockResolvedValue(profile),
  };
}

describe('GET /api/account', () => {
  it('rejects missing authentication before touching Firestore', async () => {
    const dependencies = createDependencies();
    const response = await handleAccountRequest(
      new Request('https://example.test/api/account'),
      dependencies,
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'AUTH_TOKEN_MISSING' },
    });
    expect(dependencies.verifyIdToken).not.toHaveBeenCalled();
    expect(dependencies.getOrCreateProfile).not.toHaveBeenCalled();
  });

  it('rejects invalid tokens without leaking verifier details', async () => {
    const dependencies = createDependencies();
    dependencies.verifyIdToken = vi.fn().mockRejectedValue(new Error('certificate detail'));
    const response = await handleAccountRequest(
      new Request('https://example.test/api/account', {
        headers: { authorization: 'Bearer invalid' },
      }),
      dependencies,
    );
    const body = await response.text();

    expect(response.status).toBe(401);
    expect(body).toContain('AUTH_TOKEN_INVALID');
    expect(body).not.toContain('certificate detail');
    expect(dependencies.getOrCreateProfile).not.toHaveBeenCalled();
  });

  it('reports missing server credentials as unavailable, not as an invalid user token', async () => {
    const dependencies = createDependencies();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    dependencies.verifyIdToken = vi
      .fn()
      .mockRejectedValue(new ServerConfigurationError(['FIREBASE_PRIVATE_KEY']));
    const response = await handleAccountRequest(
      new Request('https://example.test/api/account', {
        headers: { authorization: 'Bearer valid' },
      }),
      dependencies,
    );
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(body).toContain('SERVER_NOT_CONFIGURED');
    expect(body).not.toContain('FIREBASE_PRIVATE_KEY');
    expect(errorSpy).toHaveBeenCalledWith('[api] server configuration invalid', {
      requestId: expect.any(String),
      missingNames: ['FIREBASE_PRIVATE_KEY'],
    });
  });

  it('rejects browser UID impersonation after verifying the caller', async () => {
    const dependencies = createDependencies();
    const response = await handleAccountRequest(
      new Request('https://example.test/api/account?uid=another-user', {
        headers: { authorization: 'Bearer valid' },
      }),
      dependencies,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'CLIENT_UID_FORBIDDEN' },
    });
    expect(dependencies.verifyIdToken).toHaveBeenCalled();
    expect(dependencies.getOrCreateProfile).not.toHaveBeenCalled();
  });

  it('creates or reads only the verified caller profile', async () => {
    const dependencies = createDependencies();
    const response = await handleAccountRequest(
      new Request('https://example.test/api/account', {
        headers: { authorization: 'Bearer valid' },
      }),
      dependencies,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-request-id')).toBeTruthy();
    await expect(response.json()).resolves.toEqual({ profile });
    expect(dependencies.getOrCreateProfile).toHaveBeenCalledWith({
      uid: 'verified-uid',
      email: 'owner@example.com',
      emailVerified: true,
      displayName: 'Owner',
    });
  });

  it('rejects unsupported methods with an Allow header', async () => {
    const dependencies = createDependencies();
    const response = await handleAccountRequest(
      new Request('https://example.test/api/account', { method: 'POST' }),
      dependencies,
    );

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET');
    expect(dependencies.verifyIdToken).not.toHaveBeenCalled();
  });

  it('returns a generic request-correlated error for repository failures', async () => {
    const dependencies = createDependencies();
    dependencies.getOrCreateProfile = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('database secret'), { code: 5 }));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await handleAccountRequest(
      new Request('https://example.test/api/account', {
        headers: { authorization: 'Bearer valid' },
      }),
      dependencies,
    );
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(body).toContain('INTERNAL_ERROR');
    expect(body).not.toContain('database secret');
    expect(errorSpy).toHaveBeenCalledWith(
      '[api] account stage failed',
      expect.objectContaining({
        requestId: expect.any(String),
        stage: 'profile',
        errorName: 'Error',
        errorCode: '5:NOT_FOUND',
        stackFrames: expect.any(Array),
      }),
    );
    expect(errorSpy).toHaveBeenCalledWith(
      '[api] request failed',
      expect.objectContaining({ requestId: expect.any(String), errorName: 'Error' }),
    );
  });
});
