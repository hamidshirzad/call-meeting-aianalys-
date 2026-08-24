import type { User } from 'firebase/auth';

export type PublicSubscriptionStatus =
  | 'none'
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'unpaid'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'paused';

export interface AccountProfile {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  plan: 'free' | 'pro';
  subscriptionStatus: PublicSubscriptionStatus;
  entitled: boolean;
  hasBillingAccount: boolean;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

interface ApiErrorBody {
  error?: { code?: string; message?: string; requestId?: string };
}

export class BillingApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly requestId: string | null,
  ) {
    super(message);
    this.name = 'BillingApiError';
  }
}

async function authenticatedRequest<T>(
  user: User,
  path: string,
  method: 'GET' | 'POST',
): Promise<T> {
  const token = await user.getIdToken();
  const response = await fetch(path, {
    method,
    headers: { authorization: `Bearer ${token}` },
    cache: 'no-store',
  });

  let body: T | ApiErrorBody | null = null;
  try {
    body = (await response.json()) as T | ApiErrorBody;
  } catch {
    body = null;
  }

  if (!response.ok) {
    const errorBody = body as ApiErrorBody | null;
    throw new BillingApiError(
      errorBody?.error?.message ?? 'The billing service could not complete this request.',
      errorBody?.error?.code ?? 'BILLING_REQUEST_FAILED',
      errorBody?.error?.requestId ?? response.headers.get('x-request-id'),
    );
  }

  return body as T;
}

function requireSecureStripeUrl(value: unknown): string {
  if (typeof value !== 'string') {
    throw new BillingApiError('Stripe did not return a redirect URL.', 'BILLING_URL_INVALID', null);
  }

  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') {
      throw new Error('not secure');
    }
    return url.toString();
  } catch {
    throw new BillingApiError('Stripe did not return a secure redirect URL.', 'BILLING_URL_INVALID', null);
  }
}

export async function fetchAccount(user: User): Promise<AccountProfile> {
  const body = await authenticatedRequest<{ profile: AccountProfile }>(user, '/api/account', 'GET');
  return body.profile;
}

export async function createCheckout(user: User): Promise<string> {
  const body = await authenticatedRequest<{ url: string }>(
    user,
    '/api/billing/checkout',
    'POST',
  );
  return requireSecureStripeUrl(body.url);
}

export async function createPortal(user: User): Promise<string> {
  const body = await authenticatedRequest<{ url: string }>(user, '/api/billing/portal', 'POST');
  return requireSecureStripeUrl(body.url);
}
