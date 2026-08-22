import type { Firestore } from 'firebase-admin/firestore';
import { describe, expect, it, vi } from 'vitest';
import type { VerifiedPrincipal } from '../api/_lib/firebase-auth';
import { UserProfileRepository } from '../api/_lib/user-profile-repository';

const principal: VerifiedPrincipal = {
  uid: 'verified-uid',
  email: 'owner@example.com',
  emailVerified: true,
  displayName: 'Owner',
};

const timestamp = {
  toDate: () => new Date('2026-08-22T12:00:00.000Z'),
};

function createFirestore(initialData?: Record<string, unknown>) {
  let storedData = initialData;
  const reference = {
    get: vi.fn(async () => ({
      exists: storedData !== undefined,
      data: () => storedData,
    })),
  };
  const transaction = {
    get: vi.fn(async () => ({
      exists: storedData !== undefined,
      data: () => storedData,
    })),
    create: vi.fn((_reference, data: Record<string, unknown>) => {
      storedData = { ...data, createdAt: timestamp, updatedAt: timestamp };
    }),
    update: vi.fn((_reference, data: Record<string, unknown>) => {
      storedData = { ...storedData, ...data, updatedAt: timestamp };
    }),
  };
  const doc = vi.fn(() => reference);
  const collection = vi.fn(() => ({ doc }));
  const firestore = {
    collection,
    runTransaction: vi.fn(async (callback) => callback(transaction)),
  } as unknown as Firestore;

  return { firestore, collection, doc, reference, transaction, data: () => storedData };
}

describe('authoritative user profile repository', () => {
  it('creates a free, non-entitled profile at the verified UID path', async () => {
    const fake = createFirestore();
    const repository = new UserProfileRepository(fake.firestore);

    const result = await repository.getOrCreate(principal);

    expect(fake.collection).toHaveBeenCalledWith('users');
    expect(fake.doc).toHaveBeenCalledWith('verified-uid');
    expect(fake.transaction.create).toHaveBeenCalledWith(
      fake.reference,
      expect.objectContaining({
        uid: 'verified-uid',
        plan: 'free',
        subscriptionStatus: 'none',
        entitled: false,
        stripeCustomerId: null,
      }),
    );
    expect(result).toMatchObject({
      uid: 'verified-uid',
      plan: 'free',
      subscriptionStatus: 'none',
      entitled: false,
      createdAt: '2026-08-22T12:00:00.000Z',
    });
  });

  it('updates identity fields without overwriting billing authority', async () => {
    const fake = createFirestore({
      uid: 'verified-uid',
      email: 'old@example.com',
      emailVerified: false,
      displayName: 'Old Name',
      plan: 'pro',
      subscriptionStatus: 'active',
      entitled: true,
      stripeCustomerId: 'cus_preserve',
      currentPeriodEnd: '2026-09-22T12:00:00.000Z',
      cancelAtPeriodEnd: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const repository = new UserProfileRepository(fake.firestore);

    const result = await repository.getOrCreate(principal);

    expect(fake.transaction.update).toHaveBeenCalledWith(fake.reference, {
      email: 'owner@example.com',
      emailVerified: true,
      displayName: 'Owner',
      updatedAt: expect.anything(),
    });
    expect(fake.data()).toMatchObject({
      plan: 'pro',
      subscriptionStatus: 'active',
      entitled: true,
      stripeCustomerId: 'cus_preserve',
    });
    expect(result).toMatchObject({ plan: 'pro', subscriptionStatus: 'active', entitled: true });
  });

  it('fails closed when stored plan and status values are invalid', async () => {
    const fake = createFirestore({
      uid: 'verified-uid',
      email: principal.email,
      emailVerified: principal.emailVerified,
      displayName: principal.displayName,
      plan: 'enterprise',
      subscriptionStatus: 'made_up',
      entitled: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const repository = new UserProfileRepository(fake.firestore);

    await expect(repository.getOrCreate(principal)).resolves.toMatchObject({
      plan: 'free',
      subscriptionStatus: 'none',
      entitled: false,
    });
  });

  it('returns internal billing identifiers only through the server repository', async () => {
    const fake = createFirestore({
      uid: 'verified-uid',
      email: principal.email,
      emailVerified: principal.emailVerified,
      displayName: principal.displayName,
      plan: 'free',
      subscriptionStatus: 'none',
      entitled: false,
      stripeCustomerId: 'cus_server',
      stripeSubscriptionId: 'sub_server',
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const repository = new UserProfileRepository(fake.firestore);

    await expect(repository.getBillingIdentity(principal)).resolves.toEqual({
      uid: 'verified-uid',
      email: 'owner@example.com',
      stripeCustomerId: 'cus_server',
      stripeSubscriptionId: 'sub_server',
      subscriptionStatus: 'none',
    });
  });

  it('claims one Stripe Customer and reuses the winner during races', async () => {
    const fake = createFirestore({
      uid: 'verified-uid',
      email: principal.email,
      plan: 'free',
      subscriptionStatus: 'none',
      stripeCustomerId: null,
    });
    const repository = new UserProfileRepository(fake.firestore);

    await expect(repository.claimStripeCustomer('verified-uid', 'cus_first')).resolves.toBe(
      'cus_first',
    );
    await expect(repository.claimStripeCustomer('verified-uid', 'cus_second')).resolves.toBe(
      'cus_first',
    );
    expect(fake.data()).toMatchObject({ stripeCustomerId: 'cus_first' });
  });
});
