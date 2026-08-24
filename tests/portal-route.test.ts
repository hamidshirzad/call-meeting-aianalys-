import { describe, expect, it, vi } from 'vitest';
import { handlePortalRequest, type PortalHandlerDependencies } from '../api/billing/portal';

function dependencies(
  stripeCustomerId: string | null = 'cus_verified',
): PortalHandlerDependencies {
  return {
    verifyIdToken: vi.fn().mockResolvedValue({ uid: 'verified-uid' }),
    getBillingIdentity: vi.fn().mockResolvedValue({
      uid: 'verified-uid',
      email: null,
      stripeCustomerId,
      stripeSubscriptionId: null,
      subscriptionStatus: 'none',
    }),
    createPortalSession: vi.fn().mockResolvedValue('https://billing.stripe.test/session'),
    loadEnvironment: vi.fn(() => ({
      secretKey: 'sk_test_example',
      webhookSecret: 'whsec_example',
      proMonthlyPriceId: 'price_server_pro',
      appUrl: 'https://preview.example.com',
    })),
  };
}

function request(url = 'https://preview.example.com/api/billing/portal'): Request {
  return new Request(url, {
    method: 'POST',
    headers: { authorization: 'Bearer firebase-token' },
  });
}

describe('POST /api/billing/portal', () => {
  it('creates a Portal session only for the verified profile Customer', async () => {
    const deps = dependencies();
    const response = await handlePortalRequest(request(), deps);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      url: 'https://billing.stripe.test/session',
    });
    expect(deps.createPortalSession).toHaveBeenCalledWith(
      'cus_verified',
      'https://preview.example.com/#billing=portal-return',
    );
  });

  it('rejects client-selected Customer IDs', async () => {
    const deps = dependencies();
    const response = await handlePortalRequest(
      request('https://preview.example.com/api/billing/portal?customerId=cus_attacker'),
      deps,
    );

    expect(response.status).toBe(400);
    expect(deps.createPortalSession).not.toHaveBeenCalled();
  });

  it('returns a bounded conflict when no billing Customer exists', async () => {
    const deps = dependencies(null);
    const response = await handlePortalRequest(request(), deps);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'BILLING_CUSTOMER_MISSING' },
    });
    expect(deps.createPortalSession).not.toHaveBeenCalled();
  });

  it('requires authentication and POST', async () => {
    const deps = dependencies();
    const unauthenticated = await handlePortalRequest(
      new Request('https://preview.example.com/api/billing/portal', { method: 'POST' }),
      deps,
    );
    expect(unauthenticated.status).toBe(401);

    const wrongMethod = await handlePortalRequest(
      new Request('https://preview.example.com/api/billing/portal'),
      deps,
    );
    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.headers.get('allow')).toBe('POST');
  });
});
