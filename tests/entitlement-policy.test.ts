import { describe, expect, it } from 'vitest';
import { isSubscriptionEntitled } from '../api/_lib/entitlement-policy';

const now = new Date('2026-08-22T12:00:00.000Z');

describe('subscription entitlement policy', () => {
  it('entitles active and trialing subscriptions', () => {
    expect(isSubscriptionEntitled('active', null, now)).toBe(true);
    expect(isSubscriptionEntitled('trialing', null, now)).toBe(true);
  });

  it('allows a bounded seven-day past-due grace period', () => {
    expect(isSubscriptionEntitled('past_due', '2026-08-15T12:00:00.000Z', now)).toBe(true);
    expect(isSubscriptionEntitled('past_due', '2026-08-15T11:59:59.999Z', now)).toBe(false);
  });

  it('denies malformed, future, and missing past-due timestamps', () => {
    expect(isSubscriptionEntitled('past_due', null, now)).toBe(false);
    expect(isSubscriptionEntitled('past_due', 'not-a-date', now)).toBe(false);
    expect(isSubscriptionEntitled('past_due', '2026-08-23T12:00:00.000Z', now)).toBe(false);
  });

  it('denies every non-entitled subscription state', () => {
    for (const status of [
      'none',
      'unpaid',
      'canceled',
      'incomplete',
      'incomplete_expired',
      'paused',
    ] as const) {
      expect(isSubscriptionEntitled(status, null, now)).toBe(false);
    }
  });
});
