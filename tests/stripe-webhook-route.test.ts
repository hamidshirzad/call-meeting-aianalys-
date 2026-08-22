import type Stripe from 'stripe';
import { describe, expect, it, vi } from 'vitest';
import {
  handleStripeWebhook,
  type StripeWebhookDependencies,
} from '../api/stripe/webhook';

function subscription(overrides: Record<string, unknown> = {}): Stripe.Subscription {
  return {
    id: 'sub_current',
    object: 'subscription',
    customer: 'cus_owner',
    status: 'active',
    livemode: false,
    cancel_at_period_end: false,
    metadata: { firebaseUid: 'verified-uid' },
    items: {
      data: [
        {
          id: 'si_current',
          price: { id: 'price_server_pro' },
          current_period_end: 1_800_000_000,
        },
      ],
    },
    ...overrides,
  } as unknown as Stripe.Subscription;
}

function stripeEvent(
  type: string,
  object: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
): Stripe.Event {
  return {
    id: 'evt_verified',
    object: 'event',
    api_version: '2026-07-29.dahlia',
    created: 200,
    livemode: false,
    pending_webhooks: 1,
    request: null,
    type,
    data: { object },
    ...overrides,
  } as unknown as Stripe.Event;
}

function dependencies(event: Stripe.Event): StripeWebhookDependencies {
  return {
    loadEnvironment: vi.fn(() => ({
      secretKey: 'sk_test_example',
      webhookSecret: 'whsec_expected',
      proMonthlyPriceId: 'price_server_pro',
      appUrl: 'https://preview.example.com',
    })),
    constructEvent: vi.fn(() => event),
    retrieveSubscription: vi.fn().mockResolvedValue(subscription()),
    findUidByCustomer: vi.fn().mockResolvedValue('verified-uid'),
    associateCheckout: vi.fn().mockResolvedValue({ outcome: 'associated' }),
    applySubscription: vi.fn().mockResolvedValue({ outcome: 'applied' }),
  };
}

function request(body = '{ "raw": true }', signature = 't=1,v1=signature'): Request {
  return new Request('https://preview.example.com/api/stripe/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': signature },
    body,
  });
}

describe('POST /api/stripe/webhook', () => {
  it('rejects missing or invalid signatures before processing', async () => {
    const deps = dependencies(stripeEvent('ignored.event', {}));
    const missing = await handleStripeWebhook(
      new Request('https://preview.example.com/api/stripe/webhook', {
        method: 'POST',
        body: '{}',
      }),
      deps,
    );
    expect(missing.status).toBe(400);
    expect(deps.constructEvent).not.toHaveBeenCalled();

    deps.constructEvent = vi.fn(() => {
      throw new Error('signature detail');
    });
    const invalid = await handleStripeWebhook(request(), deps);
    const body = await invalid.text();
    expect(invalid.status).toBe(400);
    expect(body).toContain('STRIPE_SIGNATURE_INVALID');
    expect(body).not.toContain('signature detail');
    expect(deps.applySubscription).not.toHaveBeenCalled();
  });

  it('passes the exact raw body and configured secret to signature verification', async () => {
    const event = stripeEvent('ignored.event', {});
    const deps = dependencies(event);
    const rawBody = '{\n  "preserve": "spacing"\n}\n';
    const response = await handleStripeWebhook(request(rawBody), deps);

    expect(response.status).toBe(200);
    expect(deps.constructEvent).toHaveBeenCalledWith(
      rawBody,
      't=1,v1=signature',
      'whsec_expected',
    );
    await expect(response.json()).resolves.toMatchObject({ processed: false, outcome: 'ignored' });
  });

  it('associates Checkout but does not apply entitlement', async () => {
    const event = stripeEvent('checkout.session.completed', {
      id: 'cs_test',
      object: 'checkout.session',
      customer: 'cus_owner',
      subscription: 'sub_owner',
      client_reference_id: 'verified-uid',
      metadata: { firebaseUid: 'verified-uid' },
    });
    const deps = dependencies(event);
    const response = await handleStripeWebhook(request(), deps);

    expect(response.status).toBe(200);
    expect(deps.associateCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'evt_verified' }),
      {
        uid: 'verified-uid',
        customerId: 'cus_owner',
        subscriptionId: 'sub_owner',
      },
    );
    expect(deps.applySubscription).not.toHaveBeenCalled();
  });

  it('retrieves current subscription state before applying subscription events', async () => {
    const event = stripeEvent('customer.subscription.updated', {
      id: 'sub_event_payload',
      object: 'subscription',
    });
    const deps = dependencies(event);
    const response = await handleStripeWebhook(request(), deps);

    expect(response.status).toBe(200);
    expect(deps.retrieveSubscription).toHaveBeenCalledWith('sub_event_payload');
    expect(deps.applySubscription).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'evt_verified' }),
      expect.objectContaining({
        uid: 'verified-uid',
        subscriptionId: 'sub_current',
        plan: 'pro',
      }),
      'verified-uid',
    );
  });

  it('reconciles paid and failed invoices through their current subscription', async () => {
    for (const type of ['invoice.paid', 'invoice.payment_failed']) {
      const event = stripeEvent(type, {
        id: 'in_event',
        object: 'invoice',
        parent: {
          type: 'subscription_details',
          subscription_details: { subscription: 'sub_invoice' },
        },
      });
      const deps = dependencies(event);
      const response = await handleStripeWebhook(request(), deps);
      expect(response.status).toBe(200);
      expect(deps.retrieveSubscription).toHaveBeenCalledWith('sub_invoice');
      expect(deps.applySubscription).toHaveBeenCalled();
    }
  });

  it('rejects live-mode events in the test milestone', async () => {
    const event = stripeEvent('customer.subscription.updated', {}, { livemode: true });
    const deps = dependencies(event);
    const response = await handleStripeWebhook(request(), deps);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'BILLING_LIVE_MODE_FORBIDDEN' },
    });
    expect(deps.retrieveSubscription).not.toHaveBeenCalled();
  });

  it('rejects unsupported methods with an Allow header', async () => {
    const deps = dependencies(stripeEvent('ignored.event', {}));
    const response = await handleStripeWebhook(
      new Request('https://preview.example.com/api/stripe/webhook'),
      deps,
    );
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
  });
});
