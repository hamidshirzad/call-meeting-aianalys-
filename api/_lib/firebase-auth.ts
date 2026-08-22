import { ApiError, ServerConfigurationError } from './api-errors.js';
import { getFirebaseAdminServices } from './firebase-admin.js';

export interface VerifiedPrincipal {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
}

export interface FirebaseTokenClaims {
  uid: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
}

export type VerifyIdToken = (
  token: string,
  checkRevoked: boolean,
) => Promise<FirebaseTokenClaims>;

export function extractBearerToken(authorization: string | null): string {
  if (!authorization) {
    throw new ApiError(401, 'AUTH_TOKEN_MISSING', 'A Firebase ID token is required.');
  }

  const match = /^Bearer ([^\s]+)$/i.exec(authorization.trim());
  if (!match || match[1].length > 8192) {
    throw new ApiError(401, 'AUTH_TOKEN_INVALID', 'The Firebase ID token is invalid.');
  }

  return match[1];
}

export async function authenticateRequest(
  request: Request,
  verifyIdToken: VerifyIdToken = (token, checkRevoked) =>
    getFirebaseAdminServices().auth.verifyIdToken(token, checkRevoked),
): Promise<VerifiedPrincipal> {
  const token = extractBearerToken(request.headers.get('authorization'));

  try {
    const decoded = await verifyIdToken(token, true);
    if (!decoded.uid?.trim()) {
      throw new Error('Firebase token did not contain a UID.');
    }

    return {
      uid: decoded.uid,
      email: decoded.email ?? null,
      emailVerified: decoded.email_verified === true,
      displayName: decoded.name ?? null,
    };
  } catch (error) {
    if (error instanceof ServerConfigurationError) {
      throw error;
    }
    throw new ApiError(401, 'AUTH_TOKEN_INVALID', 'The Firebase ID token is invalid.');
  }
}
