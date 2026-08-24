import { ApiError } from './api-errors.js';

const forbiddenQueryParameters = ['uid', 'userId', 'priceId', 'customerId', 'subscriptionId'];

export async function rejectClientBillingAuthority(request: Request): Promise<void> {
  const url = new URL(request.url);
  if (forbiddenQueryParameters.some((name) => url.searchParams.has(name))) {
    throw new ApiError(
      400,
      'CLIENT_BILLING_FORBIDDEN',
      'Billing identity and prices are controlled by the server.',
    );
  }

  const body = await request.text();
  if (body.trim() && body.trim() !== '{}') {
    throw new ApiError(
      400,
      'CLIENT_BILLING_FORBIDDEN',
      'Billing identity and prices are controlled by the server.',
    );
  }
}
