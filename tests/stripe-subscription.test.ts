import type Stripe from 'stripe';
import { describe, expect, it } from 'vitest';
import {
  subscriptionIdFromInvoice,
  toSubscriptionSnapshot,
} from '../api/_lib/stripe-subscription';

const environment = {
  secretKey: 'sk_test_example',
  webhookSecret: 'whsec_example',
  proMonthlyPriceId: 'price_pro',
  appUrl: 'https://preview.example.com',
};

function subscription(overrides: Record<string, unknown> = {}): Stripe.Subscription {
  return {
    id: 'sub_example',
    object: 'subscription',
    customer: 'cus_example',
    status: 'active',
    livemode: false,
    cancel_at_period_end: false,
    metadata: { firebaseUid: 'verified-uid' },
    items: {
      data: [
        {
          id: 'si_1',
          price: { id: 'price_pro' },
          current_period_end: 1_800_000_000,
        },
      ],
    },
    ...overrides,
  } as unknown as Stripe.Subscription;
}

describe('Stripe subscription normalization', () => {
  it('derives plan, owner, and item period from the allowlisted Price', () => {
    expect(toSubscriptionSnapshot(subscription(), environment)).toEqual({
      uid: 'verified-uid',
      customerId: 'cus_example',
      subscriptionId: 'sub_example',
      priceId: 'price_pro',
      plan: 'pro',
      status: 'active',
      currentPeriodEnd: new Date(1_800_000_000 * 1000).toISOString(),
      cancelAtPeriodEnd: false,
    });
  });

  it('fails closed when Stripe has a non-allowlisted Price or unknown status', () => {
    const result = toSubscriptionSnapshot(
      subscription({
        status: 'future_status',
        items: {
          data: [
            {
              id: 'si_other',
              price: { id: 'price_other' },
              current_period_end: 1_800_000_000,
            },
          ],
        },
      }),
      environment,
    );

    expect(result).toMatchObject({ plan: 'free', status: 'none', priceId: 'price_other' });
  });

  it('reads the subscription from the current Invoice parent shape', () => {
    const invoice = {
      parent: {
        type: 'subscription_details',
        subscription_details: { subscription: 'sub_invoice' },
      },
    } as unknown as Stripe.Invoice;

    expect(subscriptionIdFromInvoice(invoice)).toBe('sub_invoice');
    expect(subscriptionIdFromInvoice({ parent: null } as Stripe.Invoice)).toBeNull();
  });
});
