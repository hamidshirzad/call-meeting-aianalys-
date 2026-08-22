import { ApiError, createRequestId, errorResponse, jsonResponse } from '../_lib/api-errors.js';
import { rejectClientBillingAuthority } from '../_lib/billing-request.js';
import {
  authenticateRequest,
  type VerifiedPrincipal,
  type VerifyIdToken,
} from '../_lib/firebase-auth.js';
import { getFirebaseAdminServices } from '../_lib/firebase-admin.js';
import { generateIntegrationIdentifier, getStripeClient } from '../_lib/stripe-client.js';
import { loadStripeEnvironment, type StripeEnvironment } from '../_lib/stripe-env.js';
import {
  UserProfileRepository,
  type BillingIdentity,
  type SubscriptionStatus,
} from '../_lib/user-profile-repository.js';

export interface CheckoutSessionInput {
  uid: string;
  customerId: string;
  priceId: string;
  appUrl: string;
  integrationIdentifier: string;
}

export interface CheckoutHandlerDependencies {
  verifyIdToken: VerifyIdToken;
  getBillingIdentity(principal: VerifiedPrincipal): Promise<BillingIdentity>;
  claimStripeCustomer(uid: string, candidateCustomerId: string): Promise<string>;
  createStripeCustomer(principal: VerifiedPrincipal): Promise<string>;
  createCheckoutSession(input: CheckoutSessionInput): Promise<string>;
  loadEnvironment(): StripeEnvironment;
  generateIntegrationIdentifier(): string;
}

const blockingStatuses = new Set<SubscriptionStatus>([
  'active',
  'trialing',
  'past_due',
  'unpaid',
  'incomplete',
  'paused',
]);

async function createStripeCustomer(principal: VerifiedPrincipal): Promise<string> {
  const customer = await getStripeClient().customers.create(
    {
      ...(principal.email ? { email: principal.email } : {}),
      metadata: { firebaseUid: principal.uid },
    },
    { idempotencyKey: `firebase-customer-${principal.uid}` },
  );
  return customer.id;
}

async function createCheckoutSession(input: CheckoutSessionInput): Promise<string> {
  const metadata = { firebaseUid: input.uid, plan: 'pro' };
  const session = await getStripeClient().checkout.sessions.create({
    mode: 'subscription',
    customer: input.customerId,
    client_reference_id: input.uid,
    line_items: [{ price: input.priceId, quantity: 1 }],
    metadata,
    subscription_data: { metadata },
    integration_identifier: input.integrationIdentifier,
    success_url: `${input.appUrl}/#billing=processing`,
    cancel_url: `${input.appUrl}/#billing=canceled`,
  });

  if (!session.url) {
    throw new Error('Stripe did not return a Checkout URL.');
  }
  return session.url;
}

const defaultDependencies: CheckoutHandlerDependencies = {
  verifyIdToken: (token, checkRevoked) =>
    getFirebaseAdminServices().auth.verifyIdToken(token, checkRevoked),
  getBillingIdentity: (principal) =>
    new UserProfileRepository(getFirebaseAdminServices().firestore).getBillingIdentity(principal),
  claimStripeCustomer: (uid, customerId) =>
    new UserProfileRepository(getFirebaseAdminServices().firestore).claimStripeCustomer(
      uid,
      customerId,
    ),
  createStripeCustomer,
  createCheckoutSession,
  loadEnvironment: loadStripeEnvironment,
  generateIntegrationIdentifier,
};

export async function handleCheckoutRequest(
  request: Request,
  dependencies: CheckoutHandlerDependencies = defaultDependencies,
): Promise<Response> {
  const requestId = createRequestId();

  try {
    if (request.method !== 'POST') {
      throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Only POST is allowed.');
    }

    const principal = await authenticateRequest(request, dependencies.verifyIdToken);
    await rejectClientBillingAuthority(request);
    const environment = dependencies.loadEnvironment();
    const identity = await dependencies.getBillingIdentity(principal);

    if (identity.stripeSubscriptionId && blockingStatuses.has(identity.subscriptionStatus)) {
      throw new ApiError(
        409,
        'BILLING_SUBSCRIPTION_EXISTS',
        'Manage the existing subscription in the billing portal.',
      );
    }

    let customerId = identity.stripeCustomerId;
    if (!customerId) {
      const candidateCustomerId = await dependencies.createStripeCustomer(principal);
      customerId = await dependencies.claimStripeCustomer(principal.uid, candidateCustomerId);
    }

    const url = await dependencies.createCheckoutSession({
      uid: principal.uid,
      customerId,
      priceId: environment.proMonthlyPriceId,
      appUrl: environment.appUrl,
      integrationIdentifier: dependencies.generateIntegrationIdentifier(),
    });

    return jsonResponse({ url }, 200, requestId);
  } catch (error) {
    const response = errorResponse(error, requestId);
    if (error instanceof ApiError && error.status === 405) {
      response.headers.set('allow', 'POST');
    }
    return response;
  }
}

export default { fetch: handleCheckoutRequest };
