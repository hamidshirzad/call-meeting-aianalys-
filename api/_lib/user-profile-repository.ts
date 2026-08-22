import {
  FieldValue,
  type DocumentData,
  type Firestore,
  type Timestamp,
} from 'firebase-admin/firestore';
import type { VerifiedPrincipal } from './firebase-auth';

export type SubscriptionPlan = 'free' | 'pro';
export type SubscriptionStatus =
  | 'none'
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'unpaid'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'paused';

export interface UserProfile {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  plan: SubscriptionPlan;
  subscriptionStatus: SubscriptionStatus;
  entitled: boolean;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

const subscriptionStatuses = new Set<SubscriptionStatus>([
  'none',
  'active',
  'trialing',
  'past_due',
  'unpaid',
  'canceled',
  'incomplete',
  'incomplete_expired',
  'paused',
]);

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function timestampToIso(value: unknown): string | null {
  if (!value || typeof value !== 'object' || !('toDate' in value)) {
    return null;
  }

  const toDate = (value as Timestamp).toDate;
  if (typeof toDate !== 'function') {
    return null;
  }

  return toDate.call(value).toISOString();
}

function toSubscriptionStatus(value: unknown): SubscriptionStatus {
  return typeof value === 'string' && subscriptionStatuses.has(value as SubscriptionStatus)
    ? (value as SubscriptionStatus)
    : 'none';
}

function toProfile(principal: VerifiedPrincipal, data: DocumentData): UserProfile {
  const plan: SubscriptionPlan = data.plan === 'pro' ? 'pro' : 'free';

  return {
    uid: principal.uid,
    email: principal.email,
    emailVerified: principal.emailVerified,
    displayName: principal.displayName,
    plan,
    subscriptionStatus: toSubscriptionStatus(data.subscriptionStatus),
    entitled: plan === 'pro' && data.entitled === true,
    currentPeriodEnd: stringOrNull(data.currentPeriodEnd),
    cancelAtPeriodEnd: data.cancelAtPeriodEnd === true,
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
  };
}

export class UserProfileRepository {
  constructor(private readonly firestore: Firestore) {}

  async getOrCreate(principal: VerifiedPrincipal): Promise<UserProfile> {
    const reference = this.firestore.collection('users').doc(principal.uid);

    await this.firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);

      if (!snapshot.exists) {
        transaction.create(reference, {
          schemaVersion: 1,
          uid: principal.uid,
          email: principal.email,
          emailVerified: principal.emailVerified,
          displayName: principal.displayName,
          plan: 'free',
          subscriptionStatus: 'none',
          entitled: false,
          stripeCustomerId: null,
          stripeSubscriptionId: null,
          stripePriceId: null,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        return;
      }

      const data = snapshot.data() ?? {};
      const identityChanged =
        data.email !== principal.email ||
        data.emailVerified !== principal.emailVerified ||
        data.displayName !== principal.displayName;

      if (identityChanged) {
        transaction.update(reference, {
          email: principal.email,
          emailVerified: principal.emailVerified,
          displayName: principal.displayName,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    });

    const snapshot = await reference.get();
    if (!snapshot.exists) {
      throw new Error('The user profile could not be created.');
    }

    return toProfile(principal, snapshot.data() ?? {});
  }
}
