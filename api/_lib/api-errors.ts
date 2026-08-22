export type ApiErrorCode =
  | 'AUTH_TOKEN_MISSING'
  | 'AUTH_TOKEN_INVALID'
  | 'CLIENT_UID_FORBIDDEN'
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
    return jsonResponse(
      {
        error: {
          code: 'SERVER_NOT_CONFIGURED',
          message: 'The server authentication boundary is not configured.',
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
