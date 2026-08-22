import {
  FieldValue,
  type DocumentData,
  type Firestore,
  type UpdateData,
} from 'firebase-admin/firestore';
import { isSubscriptionEntitled } from './entitlement-policy.js';
import type { StripeSubscriptionSnapshot } from './stripe-subscription.js';
import type { SubscriptionStatus } from './user-profile-repository.js';

export interface StripeEventEnvelope {
  id: string;
  type: string;
  created: number;
}

export interface CheckoutAssociation {
  uid: string | null;
  customerId: string | null;
  subscriptionId: string | null;
}

export type WebhookMutationOutcome =
  | 'applied'
  | 'duplicate'
  | 'stale'
  | 'unmatched'
  | 'ownership_conflict'
  | 'associated';

export interface WebhookMutationResult {
  outcome: WebhookMutationOutcome;
}

const blockingStatuses = new Set<SubscriptionStatus>([
  'active',
  'trialing',
  'past_due',
  'unpaid',
  'incomplete',
  'paused',
]);

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function statusOrNone(value: unknown): SubscriptionStatus {
  return typeof value === 'string' && blockingStatuses.has(value as SubscriptionStatus)
    ? (value as SubscriptionStatus)
    : value === 'canceled' || value === 'incomplete_expired'
      ? value
      : 'none';
}

function eventRecord(event: StripeEventEnvelope, outcome: WebhookMutationOutcome) {
  return {
    eventId: event.id,
    type: event.type,
    stripeCreated: event.created,
    outcome,
    processedAt: FieldValue.serverTimestamp(),
  };
}

export class StripeWebhookRepository {
  constructor(private readonly firestore: Firestore) {}

  async findUidByCustomer(customerId: string): Promise<string | null> {
    const snapshot = await this.firestore
      .collection('users')
      .where('stripeCustomerId', '==', customerId)
      .limit(2)
      .get();

    return snapshot.size === 1 ? snapshot.docs[0].id : null;
  }

  async associateCheckout(
    event: StripeEventEnvelope,
    association: CheckoutAssociation,
  ): Promise<WebhookMutationResult> {
    const eventReference = this.firestore.collection('stripeEvents').doc(event.id);

    return this.firestore.runTransaction(async (transaction) => {
      const eventSnapshot = await transaction.get(eventReference);
      if (eventSnapshot.exists) {
        return { outcome: 'duplicate' };
      }

      if (!association.uid || !association.customerId) {
        transaction.create(eventReference, eventRecord(event, 'unmatched'));
        return { outcome: 'unmatched' };
      }

      const userReference = this.firestore.collection('users').doc(association.uid);
      const userSnapshot = await transaction.get(userReference);
      if (!userSnapshot.exists) {
        transaction.create(eventReference, eventRecord(event, 'unmatched'));
        return { outcome: 'unmatched' };
      }

      const data = userSnapshot.data() ?? {};
      const existingCustomerId = stringOrNull(data.stripeCustomerId);
      if (existingCustomerId && existingCustomerId !== association.customerId) {
        transaction.create(eventReference, eventRecord(event, 'ownership_conflict'));
        return { outcome: 'ownership_conflict' };
      }

      const update: UpdateData<DocumentData> = {
        stripeCustomerId: association.customerId,
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (!stringOrNull(data.stripeSubscriptionId) && association.subscriptionId) {
        update.stripeSubscriptionId = association.subscriptionId;
      }

      transaction.update(userReference, update);
      transaction.create(eventReference, eventRecord(event, 'associated'));
      return { outcome: 'associated' };
    });
  }

  async applySubscription(
    event: StripeEventEnvelope,
    snapshot: StripeSubscriptionSnapshot,
    resolvedUid: string | null,
  ): Promise<WebhookMutationResult> {
    const eventReference = this.firestore.collection('stripeEvents').doc(event.id);

    return this.firestore.runTransaction(async (transaction) => {
      const eventSnapshot = await transaction.get(eventReference);
      if (eventSnapshot.exists) {
        return { outcome: 'duplicate' };
      }

      if (!resolvedUid) {
        transaction.create(eventReference, eventRecord(event, 'unmatched'));
        return { outcome: 'unmatched' };
      }

      const userReference = this.firestore.collection('users').doc(resolvedUid);
      const userSnapshot = await transaction.get(userReference);
      if (!userSnapshot.exists) {
        transaction.create(eventReference, eventRecord(event, 'unmatched'));
        return { outcome: 'unmatched' };
      }

      const data = userSnapshot.data() ?? {};
      const existingCustomerId = stringOrNull(data.stripeCustomerId);
      const existingSubscriptionId = stringOrNull(data.stripeSubscriptionId);
      const existingStatus = statusOrNone(data.subscriptionStatus);
      const customerConflict = existingCustomerId && existingCustomerId !== snapshot.customerId;
      const liveSubscriptionConflict =
        existingSubscriptionId &&
        existingSubscriptionId !== snapshot.subscriptionId &&
        blockingStatuses.has(existingStatus);

      if (customerConflict || liveSubscriptionConflict) {
        transaction.create(eventReference, eventRecord(event, 'ownership_conflict'));
        return { outcome: 'ownership_conflict' };
      }

      const lastEventCreated =
        typeof data.lastStripeEventCreated === 'number' ? data.lastStripeEventCreated : -1;
      if (event.created < lastEventCreated) {
        transaction.create(eventReference, eventRecord(event, 'stale'));
        return { outcome: 'stale' };
      }

      const pastDueSince =
        snapshot.status === 'past_due'
          ? existingStatus === 'past_due' && existingSubscriptionId === snapshot.subscriptionId
            ? stringOrNull(data.pastDueSince) ?? new Date(event.created * 1000).toISOString()
            : new Date(event.created * 1000).toISOString()
          : null;
      const entitled =
        snapshot.plan === 'pro' &&
        isSubscriptionEntitled(snapshot.status, pastDueSince, new Date(event.created * 1000));

      transaction.update(userReference, {
        plan: snapshot.plan,
        subscriptionStatus: snapshot.status,
        entitled,
        stripeCustomerId: snapshot.customerId,
        stripeSubscriptionId: snapshot.subscriptionId,
        stripePriceId: snapshot.priceId,
        currentPeriodEnd: snapshot.currentPeriodEnd,
        pastDueSince,
        cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
        lastStripeEventCreated: event.created,
        lastStripeEventId: event.id,
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.create(eventReference, eventRecord(event, 'applied'));
      return { outcome: 'applied' };
    });
  }
}
