import { ApiError, createRequestId, errorResponse, jsonResponse } from '../_lib/api-errors.js';
import { rejectClientBillingAuthority } from '../_lib/billing-request.js';
import {
  authenticateRequest,
  type VerifiedPrincipal,
  type VerifyIdToken,
} from '../_lib/firebase-auth.js';
import { getFirebaseAdminServices } from '../_lib/firebase-admin.js';
import { createRuntimeFetchHandler } from '../_lib/runtime-handler.js';
import { getStripeClient } from '../_lib/stripe-client.js';
import { loadStripeEnvironment, type StripeEnvironment } from '../_lib/stripe-env.js';
import {
  UserProfileRepository,
  type BillingIdentity,
} from '../_lib/user-profile-repository.js';

export interface PortalHandlerDependencies {
  verifyIdToken: VerifyIdToken;
  getBillingIdentity(principal: VerifiedPrincipal): Promise<BillingIdentity>;
  createPortalSession(customerId: string, returnUrl: string): Promise<string>;
  loadEnvironment(): StripeEnvironment;
}

async function createPortalSession(customerId: string, returnUrl: string): Promise<string> {
  const session = await getStripeClient().billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
  return session.url;
}

const defaultDependencies: PortalHandlerDependencies = {
  verifyIdToken: (token, checkRevoked) =>
    getFirebaseAdminServices().auth.verifyIdToken(token, checkRevoked),
  getBillingIdentity: (principal) =>
    new UserProfileRepository(getFirebaseAdminServices().firestore).getBillingIdentity(principal),
  createPortalSession,
  loadEnvironment: loadStripeEnvironment,
};

export async function handlePortalRequest(
  request: Request,
  dependencies: PortalHandlerDependencies = defaultDependencies,
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
    if (!identity.stripeCustomerId) {
      throw new ApiError(
        409,
        'BILLING_CUSTOMER_MISSING',
        'No Stripe billing account exists for this user.',
      );
    }

    const url = await dependencies.createPortalSession(
      identity.stripeCustomerId,
      `${environment.appUrl}/#billing=portal-return`,
    );
    return jsonResponse({ url }, 200, requestId);
  } catch (error) {
    const response = errorResponse(error, requestId);
    if (error instanceof ApiError && error.status === 405) {
      response.headers.set('allow', 'POST');
    }
    return response;
  }
}

export default { fetch: createRuntimeFetchHandler(handlePortalRequest) };
