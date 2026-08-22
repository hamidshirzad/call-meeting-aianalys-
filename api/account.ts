import {
  ApiError,
  ServerConfigurationError,
  createRequestId,
  errorResponse,
  jsonResponse,
} from './_lib/api-errors.js';
import {
  authenticateRequest,
  type VerifiedPrincipal,
  type VerifyIdToken,
} from './_lib/firebase-auth.js';
import { getFirebaseAdminServices } from './_lib/firebase-admin.js';
import { createRuntimeFetchHandler } from './_lib/runtime-handler.js';
import { UserProfileRepository, type UserProfile } from './_lib/user-profile-repository.js';

export interface AccountHandlerDependencies {
  verifyIdToken: VerifyIdToken;
  getOrCreateProfile(principal: VerifiedPrincipal): Promise<UserProfile>;
}

const defaultDependencies: AccountHandlerDependencies = {
  verifyIdToken: (token, checkRevoked) =>
    getFirebaseAdminServices().auth.verifyIdToken(token, checkRevoked),
  getOrCreateProfile: (principal) =>
    new UserProfileRepository(getFirebaseAdminServices().firestore).getOrCreate(principal),
};

type AccountRequestStage = 'method' | 'authenticate' | 'client-input' | 'profile';

const grpcStatusNames: Readonly<Record<number, string>> = Object.freeze({
  0: 'OK',
  1: 'CANCELLED',
  2: 'UNKNOWN',
  3: 'INVALID_ARGUMENT',
  4: 'DEADLINE_EXCEEDED',
  5: 'NOT_FOUND',
  6: 'ALREADY_EXISTS',
  7: 'PERMISSION_DENIED',
  8: 'RESOURCE_EXHAUSTED',
  9: 'FAILED_PRECONDITION',
  10: 'ABORTED',
  11: 'OUT_OF_RANGE',
  12: 'UNIMPLEMENTED',
  13: 'INTERNAL',
  14: 'UNAVAILABLE',
  15: 'DATA_LOSS',
  16: 'UNAUTHENTICATED',
});

function safeErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return null;
  }

  if (typeof error.code === 'number' && Number.isInteger(error.code)) {
    return `${error.code}:${grpcStatusNames[error.code] ?? 'UNRECOGNIZED'}`;
  }

  return typeof error.code === 'string' ? error.code.slice(0, 80) : null;
}

function safeStackFrames(error: unknown): string[] {
  if (!(error instanceof Error) || !error.stack) {
    return [];
  }

  return error.stack
    .split('\n')
    .slice(1, 5)
    .map((frame) => frame.trim().replace(process.cwd(), '<app>'));
}

export async function handleAccountRequest(
  request: Request,
  dependencies: AccountHandlerDependencies = defaultDependencies,
): Promise<Response> {
  const requestId = createRequestId();
  let stage: AccountRequestStage = 'method';

  try {
    if (request.method !== 'GET') {
      throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Only GET is allowed.');
    }

    stage = 'authenticate';
    const principal = await authenticateRequest(request, dependencies.verifyIdToken);
    stage = 'client-input';
    const url = new URL(request.url);

    if (url.searchParams.has('uid') || url.searchParams.has('userId')) {
      throw new ApiError(
        400,
        'CLIENT_UID_FORBIDDEN',
        'User identity must come from the verified Firebase token.',
      );
    }

    stage = 'profile';
    const profile = await dependencies.getOrCreateProfile(principal);
    return jsonResponse({ profile }, 200, requestId);
  } catch (error) {
    if (!(error instanceof ApiError) && !(error instanceof ServerConfigurationError)) {
      console.error('[api] account stage failed', {
        requestId,
        stage,
        errorName: error instanceof Error ? error.name : 'UnknownError',
        errorCode: safeErrorCode(error),
        stackFrames: safeStackFrames(error),
      });
    }

    const response = errorResponse(error, requestId);
    if (error instanceof ApiError && error.status === 405) {
      response.headers.set('allow', 'GET');
    }
    return response;
  }
}

export default {
  fetch: createRuntimeFetchHandler(handleAccountRequest),
};
