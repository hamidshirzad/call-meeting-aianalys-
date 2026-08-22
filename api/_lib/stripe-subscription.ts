import type Stripe from 'stripe';
import type { StripeEnvironment } from './stripe-env';
import type { SubscriptionPlan, SubscriptionStatus } from './user-profile-repository';

export interface StripeSubscriptionSnapshot {
  uid: string | null;
  customerId: string;
  subscriptionId: string;
  priceId: string | null;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

const supportedStatuses = new Set<SubscriptionStatus>([
  'active',
  'trialing',
  'past_due',
  'unpaid',
  'canceled',
  'incomplete',
  'incomplete_expired',
  'paused',
]);

export function stripeResourceId(resource: { id: string } | string | null): string | null {
  if (!resource) {
    return null;
  }
  return typeof resource === 'string' ? resource : resource.id;
}

function toStatus(status: string): SubscriptionStatus {
  return supportedStatuses.has(status as SubscriptionStatus)
    ? (status as SubscriptionStatus)
    : 'none';
}

function toIsoTimestamp(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) {
    return null;
  }
  return new Date(seconds * 1000).toISOString();
}

export function toSubscriptionSnapshot(
  subscription: Stripe.Subscription,
  environment: StripeEnvironment,
): StripeSubscriptionSnapshot {
  const priceIds = subscription.items.data.map((item) => item.price.id);
  const allowedPriceId = priceIds.find((priceId) => priceId === environment.proMonthlyPriceId);
  const currentPeriodEndSeconds = subscription.items.data.reduce<number | null>(
    (latest, item) =>
      latest === null || item.current_period_end > latest ? item.current_period_end : latest,
    null,
  );
  const uid = subscription.metadata.firebaseUid?.trim() || null;

  return {
    uid,
    customerId: stripeResourceId(subscription.customer)!,
    subscriptionId: subscription.id,
    priceId: allowedPriceId ?? priceIds[0] ?? null,
    plan: allowedPriceId ? 'pro' : 'free',
    status: toStatus(subscription.status),
    currentPeriodEnd: toIsoTimestamp(currentPeriodEndSeconds),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  };
}

export function subscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  if (invoice.parent?.type !== 'subscription_details') {
    return null;
  }

  return stripeResourceId(invoice.parent.subscription_details?.subscription ?? null);
}
