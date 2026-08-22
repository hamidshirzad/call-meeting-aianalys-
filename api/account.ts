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

function safeErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return null;
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
  fetch: handleAccountRequest,
};
