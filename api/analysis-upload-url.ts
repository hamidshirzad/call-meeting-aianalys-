import {
  ApiError,
  createRequestId,
  errorResponse,
  jsonResponse,
} from './_lib/api-errors.js';
import {
  normalizeAudioType,
  validateUploadMetadata,
} from './_lib/analysis-policy.js';
import {
  AnalysisRepository,
  type ReservedUpload,
} from './_lib/analysis-repository.js';
import {
  authenticateRequest,
  type VerifiedPrincipal,
  type VerifyIdToken,
} from './_lib/firebase-auth.js';
import { getFirebaseAdminServices } from './_lib/firebase-admin.js';
import { startResumableUpload } from './_lib/gemini-analyzer.js';
import { createRuntimeFetchHandler } from './_lib/runtime-handler.js';

export interface UploadUrlHandlerDependencies {
  verifyIdToken: VerifyIdToken;
  reserve(
    principal: VerifiedPrincipal,
    reservationId: string,
    upload: { geminiNonce: string; declaredSize: number; contentType: string },
  ): Promise<ReservedUpload>;
  startUpload(mimeType: string, sizeBytes: number, displayName: string): Promise<string>;
  release(reservation: ReservedUpload): Promise<void>;
}

function repository() {
  return new AnalysisRepository(getFirebaseAdminServices().firestore);
}

const defaultDependencies: UploadUrlHandlerDependencies = {
  verifyIdToken: (token, checkRevoked) =>
    getFirebaseAdminServices().auth.verifyIdToken(token, checkRevoked),
  reserve: (principal, reservationId, upload) =>
    repository().reserve(principal, reservationId, upload),
  startUpload: startResumableUpload,
  release: (reservation) => repository().release(reservation),
};

async function readInput(request: Request): Promise<{ size: number; contentType: string }> {
  if (Number(request.headers.get('content-length') ?? 0) > 4_096) {
    throw new ApiError(413, 'ANALYSIS_INPUT_INVALID', 'The analysis request is too large.');
  }

  let input: Record<string, unknown>;
  try {
    input = await request.json() as Record<string, unknown>;
  } catch {
    throw new ApiError(400, 'ANALYSIS_INPUT_INVALID', 'The analysis request is invalid.');
  }

  if (input.uid !== undefined || input.userId !== undefined || input.plan !== undefined) {
    throw new ApiError(
      400,
      'CLIENT_UID_FORBIDDEN',
      'User identity and plan must come from the verified server session.',
    );
  }

  return {
    size: Number(input.size),
    contentType: typeof input.contentType === 'string' ? input.contentType : '',
  };
}

/**
 * Authorizes an upload and hands back a URL the browser sends audio to directly.
 *
 * Quota is reserved before the URL exists, so a client cannot mint upload URLs
 * without first passing the monthly limit. If Gemini then refuses the session,
 * the reservation is released rather than left holding a slot the user never used.
 */
export async function handleUploadUrlRequest(
  request: Request,
  dependencies: UploadUrlHandlerDependencies = defaultDependencies,
): Promise<Response> {
  const requestId = createRequestId();
  let reservation: ReservedUpload | null = null;
  let minted = false;

  try {
    if (request.method !== 'POST') {
      throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Only POST is allowed.');
    }

    const principal = await authenticateRequest(request, dependencies.verifyIdToken);
    const { size, contentType } = await readInput(request);
    validateUploadMetadata(size, contentType);

    const mimeType = normalizeAudioType(contentType);
    // Never sent to the browser: it is the secret that later proves the
    // uploaded file came from this reservation.
    const geminiNonce = crypto.randomUUID();

    reservation = await dependencies.reserve(principal, crypto.randomUUID(), {
      geminiNonce,
      declaredSize: size,
      contentType: mimeType,
    });

    const uploadUrl = await dependencies.startUpload(mimeType, size, geminiNonce);
    minted = true;

    return jsonResponse({ uploadUrl, reservationId: reservation.id }, 200, requestId);
  } catch (error) {
    const response = errorResponse(error, requestId);
    if (error instanceof ApiError && error.status === 405) {
      response.headers.set('allow', 'POST');
    }
    return response;
  } finally {
    if (reservation && !minted) {
      await dependencies.release(reservation).catch(() => undefined);
    }
  }
}

export default {
  fetch: createRuntimeFetchHandler(handleUploadUrlRequest),
};
