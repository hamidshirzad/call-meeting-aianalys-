import type { Firestore } from 'firebase-admin/firestore';
import { describe, expect, it, vi } from 'vitest';
import type { StripeSubscriptionSnapshot } from '../api/_lib/stripe-subscription';
import {
  StripeWebhookRepository,
  type StripeEventEnvelope,
} from '../api/_lib/stripe-webhook-repository';

interface FakeReference {
  collectionName: 'users' | 'stripeEvents';
  id: string;
}

function createFirestore(initialUsers: Record<string, Record<string, unknown>>) {
  const users = new Map(Object.entries(initialUsers));
  const events = new Map<string, Record<string, unknown>>();
  const mapFor = (reference: FakeReference) =>
    reference.collectionName === 'users' ? users : events;
  const snapshot = (reference: FakeReference) => {
    const data = mapFor(reference).get(reference.id);
    return { exists: data !== undefined, id: reference.id, data: () => data };
  };

  const transaction = {
    get: vi.fn(async (reference: FakeReference) => snapshot(reference)),
    create: vi.fn((reference: FakeReference, data: Record<string, unknown>) => {
      const map = mapFor(reference);
      if (map.has(reference.id)) throw new Error('already exists');
      map.set(reference.id, { ...data });
    }),
    update: vi.fn((reference: FakeReference, data: Record<string, unknown>) => {
      const map = mapFor(reference);
      map.set(reference.id, { ...map.get(reference.id), ...data });
    }),
  };

  const collection = vi.fn((collectionName: 'users' | 'stripeEvents') => ({
    doc: (id: string): FakeReference => ({ collectionName, id }),
    where: (_field: string, _operator: string, customerId: string) => ({
      limit: (_count: number) => ({
        get: async () => {
          const docs = Array.from(users.entries())
            .filter(([, data]) => data.stripeCustomerId === customerId)
            .map(([id, data]) => ({ id, data: () => data }));
          return { size: docs.length, docs };
        },
      }),
    }),
  }));

  const firestore = {
    collection,
    runTransaction: vi.fn(async (callback) => callback(transaction)),
  } as unknown as Firestore;

  return { firestore, users, events, transaction };
}

const event = (id: string, created: number): StripeEventEnvelope => ({
  id,
  type: 'customer.subscription.updated',
  created,
});

function snapshot(overrides: Partial<StripeSubscriptionSnapshot> = {}): StripeSubscriptionSnapshot {
  return {
    uid: 'verified-uid',
    customerId: 'cus_owner',
    subscriptionId: 'sub_owner',
    priceId: 'price_pro',
    plan: 'pro',
    status: 'active',
    currentPeriodEnd: '2026-09-22T12:00:00.000Z',
    cancelAtPeriodEnd: false,
    ...overrides,
  };
}

function user(overrides: Record<string, unknown> = {}) {
  return {
    uid: 'verified-uid',
    plan: 'free',
    subscriptionStatus: 'none',
    entitled: false,
    stripeCustomerId: 'cus_owner',
    stripeSubscriptionId: null,
    ...overrides,
  };
}

describe('atomic Stripe webhook repository', () => {
  it('applies an allowlisted subscription and records the event atomically', async () => {
    const fake = createFirestore({ 'verified-uid': user() });
    const repository = new StripeWebhookRepository(fake.firestore);

    await expect(repository.applySubscription(event('evt_active', 200), snapshot(), 'verified-uid'))
      .resolves.toEqual({ outcome: 'applied' });
    expect(fake.users.get('verified-uid')).toMatchObject({
      plan: 'pro',
      subscriptionStatus: 'active',
      entitled: true,
      stripeSubscriptionId: 'sub_owner',
      lastStripeEventCreated: 200,
    });
    expect(fake.events.get('evt_active')).toMatchObject({ outcome: 'applied' });
  });

  it('deduplicates repeated event IDs', async () => {
    const fake = createFirestore({ 'verified-uid': user() });
    const repository = new StripeWebhookRepository(fake.firestore);

    await repository.applySubscription(event('evt_duplicate', 200), snapshot(), 'verified-uid');
    await expect(
      repository.applySubscription(
        event('evt_duplicate', 200),
        snapshot({ status: 'canceled' }),
        'verified-uid',
      ),
    ).resolves.toEqual({ outcome: 'duplicate' });
    expect(fake.users.get('verified-uid')).toMatchObject({ subscriptionStatus: 'active' });
  });

  it('records but ignores out-of-order events', async () => {
    const fake = createFirestore({ 'verified-uid': user() });
    const repository = new StripeWebhookRepository(fake.firestore);

    await repository.applySubscription(event('evt_new', 300), snapshot(), 'verified-uid');
    await expect(
      repository.applySubscription(
        event('evt_old', 100),
        snapshot({ status: 'canceled' }),
        'verified-uid',
      ),
    ).resolves.toEqual({ outcome: 'stale' });
    expect(fake.users.get('verified-uid')).toMatchObject({ subscriptionStatus: 'active' });
    expect(fake.events.get('evt_old')).toMatchObject({ outcome: 'stale' });
  });

  it('revokes canceled and non-allowlisted subscriptions', async () => {
    const fake = createFirestore({ 'verified-uid': user() });
    const repository = new StripeWebhookRepository(fake.firestore);

    await repository.applySubscription(
      event('evt_canceled', 200),
      snapshot({ status: 'canceled' }),
      'verified-uid',
    );
    expect(fake.users.get('verified-uid')).toMatchObject({
      plan: 'pro',
      subscriptionStatus: 'canceled',
      entitled: false,
    });

    await repository.applySubscription(
      event('evt_wrong_price', 300),
      snapshot({ plan: 'free', priceId: 'price_other', status: 'active' }),
      'verified-uid',
    );
    expect(fake.users.get('verified-uid')).toMatchObject({ plan: 'free', entitled: false });
  });

  it('starts past-due grace once and rejects ownership conflicts', async () => {
    const fake = createFirestore({ 'verified-uid': user() });
    const repository = new StripeWebhookRepository(fake.firestore);

    await repository.applySubscription(
      event('evt_past_due', 200),
      snapshot({ status: 'past_due' }),
      'verified-uid',
    );
    expect(fake.users.get('verified-uid')).toMatchObject({
      subscriptionStatus: 'past_due',
      entitled: true,
      pastDueSince: new Date(200 * 1000).toISOString(),
    });

    await expect(
      repository.applySubscription(
        event('evt_attacker', 300),
        snapshot({ customerId: 'cus_other' }),
        'verified-uid',
      ),
    ).resolves.toEqual({ outcome: 'ownership_conflict' });
    expect(fake.users.get('verified-uid')).toMatchObject({ stripeCustomerId: 'cus_owner' });
  });

  it('associates Checkout without granting entitlement', async () => {
    const fake = createFirestore({
      'verified-uid': user({ stripeCustomerId: null, stripeSubscriptionId: null }),
    });
    const repository = new StripeWebhookRepository(fake.firestore);

    await expect(
      repository.associateCheckout(
        { id: 'evt_checkout', type: 'checkout.session.completed', created: 200 },
        { uid: 'verified-uid', customerId: 'cus_new', subscriptionId: 'sub_new' },
      ),
    ).resolves.toEqual({ outcome: 'associated' });
    expect(fake.users.get('verified-uid')).toMatchObject({
      stripeCustomerId: 'cus_new',
      stripeSubscriptionId: 'sub_new',
      plan: 'free',
      entitled: false,
    });
  });

  it('resolves exactly one UID for a Customer mapping', async () => {
    const fake = createFirestore({
      'verified-uid': user(),
      other: user({ stripeCustomerId: 'cus_other' }),
    });
    const repository = new StripeWebhookRepository(fake.firestore);

    await expect(repository.findUidByCustomer('cus_owner')).resolves.toBe('verified-uid');
    await expect(repository.findUidByCustomer('cus_missing')).resolves.toBeNull();
  });
});
