import type Stripe from 'stripe';
import { ApiError, createRequestId, errorResponse, jsonResponse } from '../_lib/api-errors';
import { getFirebaseAdminServices } from '../_lib/firebase-admin';
import { getStripeClient } from '../_lib/stripe-client';
import { loadStripeEnvironment, type StripeEnvironment } from '../_lib/stripe-env';
import {
  stripeResourceId,
  subscriptionIdFromInvoice,
  toSubscriptionSnapshot,
} from '../_lib/stripe-subscription';
import {
  StripeWebhookRepository,
  type CheckoutAssociation,
  type StripeEventEnvelope,
  type WebhookMutationResult,
} from '../_lib/stripe-webhook-repository';

const subscriptionEventTypes = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
]);

const invoiceEventTypes = new Set(['invoice.paid', 'invoice.payment_failed']);

export interface StripeWebhookDependencies {
  loadEnvironment(): StripeEnvironment;
  constructEvent(rawBody: string, signature: string, secret: string): Stripe.Event;
  retrieveSubscription(subscriptionId: string): Promise<Stripe.Subscription>;
  findUidByCustomer(customerId: string): Promise<string | null>;
  associateCheckout(
    event: StripeEventEnvelope,
    association: CheckoutAssociation,
  ): Promise<WebhookMutationResult>;
  applySubscription(
    event: StripeEventEnvelope,
    snapshot: ReturnType<typeof toSubscriptionSnapshot>,
    resolvedUid: string | null,
  ): Promise<WebhookMutationResult>;
}

function repository(): StripeWebhookRepository {
  return new StripeWebhookRepository(getFirebaseAdminServices().firestore);
}

const defaultDependencies: StripeWebhookDependencies = {
  loadEnvironment: loadStripeEnvironment,
  constructEvent: (rawBody, signature, secret) =>
    getStripeClient().webhooks.constructEvent(rawBody, signature, secret),
  retrieveSubscription: (subscriptionId) =>
    getStripeClient().subscriptions.retrieve(subscriptionId),
  findUidByCustomer: (customerId) => repository().findUidByCustomer(customerId),
  associateCheckout: (event, association) => repository().associateCheckout(event, association),
  applySubscription: (event, snapshot, uid) =>
    repository().applySubscription(event, snapshot, uid),
};

function eventEnvelope(event: Stripe.Event): StripeEventEnvelope {
  return { id: event.id, type: event.type, created: event.created };
}

async function resolveUid(
  preferredUid: string | null,
  customerId: string,
  dependencies: StripeWebhookDependencies,
): Promise<string | null> {
  return preferredUid ?? dependencies.findUidByCustomer(customerId);
}

async function processEvent(
  event: Stripe.Event,
  environment: StripeEnvironment,
  dependencies: StripeWebhookDependencies,
): Promise<WebhookMutationResult | null> {
  const envelope = eventEnvelope(event);

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const customerId = stripeResourceId(session.customer);
    const preferredUid = session.metadata?.firebaseUid?.trim() || session.client_reference_id;
    const uid = customerId
      ? await resolveUid(preferredUid || null, customerId, dependencies)
      : preferredUid || null;

    return dependencies.associateCheckout(envelope, {
      uid,
      customerId,
      subscriptionId: stripeResourceId(session.subscription),
    });
  }

  let subscriptionId: string | null = null;
  if (subscriptionEventTypes.has(event.type)) {
    subscriptionId = (event.data.object as Stripe.Subscription).id;
  } else if (invoiceEventTypes.has(event.type)) {
    subscriptionId = subscriptionIdFromInvoice(event.data.object as Stripe.Invoice);
  } else {
    return null;
  }

  if (!subscriptionId) {
    return null;
  }

  const subscription = await dependencies.retrieveSubscription(subscriptionId);
  if (subscription.livemode) {
    throw new ApiError(
      400,
      'BILLING_LIVE_MODE_FORBIDDEN',
      'Live-mode Stripe events are disabled in this milestone.',
    );
  }

  const snapshot = toSubscriptionSnapshot(subscription, environment);
  const uid = await resolveUid(snapshot.uid, snapshot.customerId, dependencies);
  return dependencies.applySubscription(envelope, snapshot, uid);
}

export async function handleStripeWebhook(
  request: Request,
  dependencies: StripeWebhookDependencies = defaultDependencies,
): Promise<Response> {
  const requestId = createRequestId();

  try {
    if (request.method !== 'POST') {
      throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Only POST is allowed.');
    }

    const signature = request.headers.get('stripe-signature');
    if (!signature) {
      throw new ApiError(
        400,
        'STRIPE_SIGNATURE_MISSING',
        'A Stripe webhook signature is required.',
      );
    }

    const environment = dependencies.loadEnvironment();
    const rawBody = await request.text();
    let event: Stripe.Event;
    try {
      event = dependencies.constructEvent(rawBody, signature, environment.webhookSecret);
    } catch {
      throw new ApiError(
        400,
        'STRIPE_SIGNATURE_INVALID',
        'The Stripe webhook signature is invalid.',
      );
    }

    if (event.livemode) {
      throw new ApiError(
        400,
        'BILLING_LIVE_MODE_FORBIDDEN',
        'Live-mode Stripe events are disabled in this milestone.',
      );
    }

    const result = await processEvent(event, environment, dependencies);
    return jsonResponse(
      { received: true, processed: result !== null, outcome: result?.outcome ?? 'ignored' },
      200,
      requestId,
    );
  } catch (error) {
    const response = errorResponse(error, requestId);
    if (error instanceof ApiError && error.status === 405) {
      response.headers.set('allow', 'POST');
    }
    return response;
  }
}

export default { fetch: handleStripeWebhook };
