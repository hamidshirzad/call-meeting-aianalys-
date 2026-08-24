export type ApiErrorCode =
  | 'AUTH_TOKEN_MISSING'
  | 'AUTH_TOKEN_INVALID'
  | 'CLIENT_UID_FORBIDDEN'
  | 'CLIENT_BILLING_FORBIDDEN'
  | 'BILLING_PLAN_INVALID'
  | 'BILLING_CUSTOMER_MISSING'
  | 'BILLING_SUBSCRIPTION_EXISTS'
  | 'BILLING_LIVE_MODE_FORBIDDEN'
  | 'STRIPE_SIGNATURE_MISSING'
  | 'STRIPE_SIGNATURE_INVALID'
  | 'ANALYSIS_INPUT_INVALID'
  | 'ANALYSIS_UPLOAD_INVALID'
  | 'ANALYSIS_UPLOAD_TOO_LARGE'
  | 'ANALYSIS_AUDIO_TOO_LONG'
  | 'ANALYSIS_RESERVATION_INVALID'
  | 'ANALYSIS_UPLOAD_UNVERIFIED'
  | 'USAGE_LIMIT_REACHED'
  | 'REPORT_ID_INVALID'
  | 'REPORT_NOT_FOUND'
  | 'METHOD_NOT_ALLOWED'
  | 'SERVER_NOT_CONFIGURED'
  | 'INTERNAL_ERROR';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class ServerConfigurationError extends Error {
  constructor(public readonly missingNames: readonly string[]) {
    super(`Missing server configuration: ${missingNames.join(', ')}`);
    this.name = 'ServerConfigurationError';
  }
}

export function createRequestId(): string {
  return crypto.randomUUID();
}

export function jsonResponse(
  body: unknown,
  status: number,
  requestId: string,
  extraHeaders: HeadersInit = {},
): Response {
  const headers = new Headers(extraHeaders);
  headers.set('cache-control', 'no-store');
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('x-request-id', requestId);

  return new Response(JSON.stringify(body), { status, headers });
}

export function errorResponse(error: unknown, requestId: string): Response {
  if (error instanceof ApiError) {
    return jsonResponse(
      { error: { code: error.code, message: error.message, requestId } },
      error.status,
      requestId,
    );
  }

  if (error instanceof ServerConfigurationError) {
    console.error('[api] server configuration invalid', {
      requestId,
      missingNames: error.missingNames,
    });

    return jsonResponse(
      {
        error: {
          code: 'SERVER_NOT_CONFIGURED',
          message: 'The required server integration is not configured.',
          requestId,
        },
      },
      503,
      requestId,
    );
  }

  console.error('[api] request failed', {
    requestId,
    errorName: error instanceof Error ? error.name : 'UnknownError',
  });

  return jsonResponse(
    {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An internal error occurred.',
        requestId,
      },
    },
    500,
    requestId,
  );
}
