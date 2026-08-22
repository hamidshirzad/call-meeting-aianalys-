import { ApiError, createRequestId, errorResponse, jsonResponse } from './_lib/api-errors';
import {
  authenticateRequest,
  type VerifiedPrincipal,
  type VerifyIdToken,
} from './_lib/firebase-auth';
import { getFirebaseAdminServices } from './_lib/firebase-admin';
import { UserProfileRepository, type UserProfile } from './_lib/user-profile-repository';

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

export async function handleAccountRequest(
  request: Request,
  dependencies: AccountHandlerDependencies = defaultDependencies,
): Promise<Response> {
  const requestId = createRequestId();

  try {
    if (request.method !== 'GET') {
      throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Only GET is allowed.');
    }

    const principal = await authenticateRequest(request, dependencies.verifyIdToken);
    const url = new URL(request.url);

    if (url.searchParams.has('uid') || url.searchParams.has('userId')) {
      throw new ApiError(
        400,
        'CLIENT_UID_FORBIDDEN',
        'User identity must come from the verified Firebase token.',
      );
    }

    const profile = await dependencies.getOrCreateProfile(principal);
    return jsonResponse({ profile }, 200, requestId);
  } catch (error) {
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
