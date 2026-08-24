import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from 'firebase/auth';
import {
  BillingApiError,
  createCheckout,
  createPortal,
  fetchAccount,
} from '../lib/billing-api';

const user = { getIdToken: vi.fn().mockResolvedValue('firebase-id-token') } as unknown as User;

beforeEach(() => {
  vi.mocked(user.getIdToken).mockResolvedValue('firebase-id-token');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('browser billing API', () => {
  it('attaches the Firebase ID token when loading the authoritative profile', async () => {
    const profile = { uid: 'verified-uid', plan: 'free' };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ profile }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchAccount(user)).resolves.toEqual(profile);
    expect(fetchMock).toHaveBeenCalledWith('/api/account', {
      method: 'GET',
      headers: { authorization: 'Bearer firebase-id-token' },
      cache: 'no-store',
    });
  });

  it('sends no client Price, UID, Customer, or body to Checkout and Portal', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ url: 'https://checkout.stripe.com/test' }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ url: 'https://billing.stripe.com/test' }), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(createCheckout(user)).resolves.toBe('https://checkout.stripe.com/test');
    await expect(createPortal(user)).resolves.toBe('https://billing.stripe.com/test');

    for (const [, init] of fetchMock.mock.calls) {
      expect(init).not.toHaveProperty('body');
      expect(JSON.stringify(init)).not.toContain('price_');
      expect(JSON.stringify(init)).not.toContain('customerId');
      expect(JSON.stringify(init)).not.toContain('uid');
    }
  });

  it('returns bounded server errors with request correlation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: 'SERVER_NOT_CONFIGURED',
              message: 'The required server integration is not configured.',
              requestId: 'request-123',
            },
          }),
          { status: 503 },
        ),
      ),
    );

    await expect(fetchAccount(user)).rejects.toMatchObject({
      code: 'SERVER_NOT_CONFIGURED',
      requestId: 'request-123',
      name: BillingApiError.name,
    });
  });

  it('rejects insecure or malformed redirect URLs', async () => {
    for (const url of ['http://checkout.example.com', 'not-a-url']) {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response(JSON.stringify({ url }), { status: 200 })),
      );
      await expect(createCheckout(user)).rejects.toMatchObject({ code: 'BILLING_URL_INVALID' });
    }
  });
});
