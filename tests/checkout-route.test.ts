import { describe, expect, it, vi } from 'vitest';
import {
  handleCheckoutRequest,
  type CheckoutHandlerDependencies,
} from '../api/billing/checkout';
import type { StripeEnvironment } from '../api/_lib/stripe-env';

const environment: StripeEnvironment = {
  secretKey: 'sk_test_example',
  webhookSecret: 'whsec_example',
  proMonthlyPriceId: 'price_server_pro',
  appUrl: 'https://preview.example.com',
};

function dependencies(
  overrides: Partial<CheckoutHandlerDependencies> = {},
): CheckoutHandlerDependencies {
  return {
    verifyIdToken: vi.fn().mockResolvedValue({
      uid: 'verified-uid',
      email: 'owner@example.com',
      email_verified: true,
    }),
    getBillingIdentity: vi.fn().mockResolvedValue({
      uid: 'verified-uid',
      email: 'owner@example.com',
      stripeCustomerId: 'cus_existing',
      stripeSubscriptionId: null,
      subscriptionStatus: 'none',
    }),
    claimStripeCustomer: vi.fn().mockResolvedValue('cus_claimed'),
    createStripeCustomer: vi.fn().mockResolvedValue('cus_created'),
    createCheckoutSession: vi.fn().mockResolvedValue('https://checkout.stripe.test/session'),
    loadEnvironment: vi.fn(() => environment),
    generateIntegrationIdentifier: vi.fn(() => 'fourdoor_call_coach_abcdefgh'),
    ...overrides,
  };
}

function request(init: RequestInit = {}): Request {
  const { headers, ...rest } = init;
  return new Request('https://preview.example.com/api/billing/checkout', {
    method: 'POST',
    ...rest,
    headers: { authorization: 'Bearer firebase-token', ...headers },
  });
}

describe('POST /api/billing/checkout', () => {
  it('requires a verified Firebase session', async () => {
    const deps = dependencies();
    const response = await handleCheckoutRequest(
      new Request('https://preview.example.com/api/billing/checkout', { method: 'POST' }),
      deps,
    );

    expect(response.status).toBe(401);
    expect(deps.createCheckoutSession).not.toHaveBeenCalled();
  });

  it('uses only the server Price and verified UID', async () => {
    const deps = dependencies();
    const response = await handleCheckoutRequest(request(), deps);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      url: 'https://checkout.stripe.test/session',
    });
    expect(deps.createCheckoutSession).toHaveBeenCalledWith({
      uid: 'verified-uid',
      customerId: 'cus_existing',
      priceId: 'price_server_pro',
      appUrl: 'https://preview.example.com',
      integrationIdentifier: 'fourdoor_call_coach_abcdefgh',
    });
    expect(deps.createStripeCustomer).not.toHaveBeenCalled();
  });

  it('rejects browser-selected Prices, Customers, and UIDs', async () => {
    for (const target of [
      'https://preview.example.com/api/billing/checkout?priceId=price_attacker',
      'https://preview.example.com/api/billing/checkout?customerId=cus_attacker',
      'https://preview.example.com/api/billing/checkout?uid=another-user',
    ]) {
      const deps = dependencies();
      const response = await handleCheckoutRequest(
        new Request(target, {
          method: 'POST',
          headers: { authorization: 'Bearer firebase-token' },
        }),
        deps,
      );
      expect(response.status).toBe(400);
      expect(deps.createCheckoutSession).not.toHaveBeenCalled();
    }

    const deps = dependencies();
    const response = await handleCheckoutRequest(
      request({
        body: JSON.stringify({ priceId: 'price_attacker', customerId: 'cus_attacker' }),
        headers: { 'content-type': 'application/json' },
      }),
      deps,
    );
    expect(response.status).toBe(400);
    expect(deps.createCheckoutSession).not.toHaveBeenCalled();
  });

  it('creates and transactionally claims a Customer when none exists', async () => {
    const deps = dependencies({
      getBillingIdentity: vi.fn().mockResolvedValue({
        uid: 'verified-uid',
        email: 'owner@example.com',
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        subscriptionStatus: 'none',
      }),
    });

    const response = await handleCheckoutRequest(request(), deps);

    expect(response.status).toBe(200);
    expect(deps.createStripeCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ uid: 'verified-uid' }),
    );
    expect(deps.claimStripeCustomer).toHaveBeenCalledWith('verified-uid', 'cus_created');
    expect(deps.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'cus_claimed' }),
    );
  });

  it('blocks a second Checkout for an existing live subscription', async () => {
    const deps = dependencies({
      getBillingIdentity: vi.fn().mockResolvedValue({
        uid: 'verified-uid',
        email: 'owner@example.com',
        stripeCustomerId: 'cus_existing',
        stripeSubscriptionId: 'sub_existing',
        subscriptionStatus: 'active',
      }),
    });
    const response = await handleCheckoutRequest(request(), deps);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'BILLING_SUBSCRIPTION_EXISTS' },
    });
    expect(deps.createCheckoutSession).not.toHaveBeenCalled();
  });

  it('rejects unsupported methods before authentication', async () => {
    const deps = dependencies();
    const response = await handleCheckoutRequest(
      new Request('https://preview.example.com/api/billing/checkout'),
      deps,
    );
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
    expect(deps.verifyIdToken).not.toHaveBeenCalled();
  });
});
