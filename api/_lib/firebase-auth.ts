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

interface FirebaseVerifierError {
  code?: unknown;
}

function readTokenAudience(token: string): string | null {
  const [, payload] = token.split('.');
  if (!payload) {
    return null;
  }

  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      aud?: unknown;
    };
    return typeof claims.aud === 'string' && claims.aud.trim().length > 0
      ? claims.aud.trim()
      : null;
  } catch {
    return null;
  }
}

function safeVerifierCode(error: unknown): string {
  const code = (error as FirebaseVerifierError | null)?.code;
  return typeof code === 'string' && /^(?:app|auth)\/[a-z0-9-]+$/.test(code)
    ? code
    : 'unknown';
}

export function createFirebaseAuthDiagnostic(error: unknown, token: string) {
  const tokenAudience = readTokenAudience(token);
  const configuredProjectId = process.env.FIREBASE_PROJECT_ID?.trim() || null;

  return {
    verifierCode: safeVerifierCode(error),
    tokenAudiencePresent: tokenAudience !== null,
    audienceMatchesConfiguredProject:
      tokenAudience && configuredProjectId ? tokenAudience === configuredProjectId : null,
  } as const;
}

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

    console.error(
      '[api] Firebase ID token rejected',
      createFirebaseAuthDiagnostic(error, token),
    );
    throw new ApiError(401, 'AUTH_TOKEN_INVALID', 'The Firebase ID token is invalid.');
  }
}
