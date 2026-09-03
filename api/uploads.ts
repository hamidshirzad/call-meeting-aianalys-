import {
  ApiError,
  createRequestId,
  errorResponse,
  jsonResponse,
} from './_lib/api-errors.js';
import { normalizeAudioType, validateUploadMetadata } from './_lib/analysis-policy.js';
import { AnalysisRepository } from './_lib/analysis-repository.js';
import {
  authenticateRequest,
  type VerifiedPrincipal,
  type VerifyIdToken,
} from './_lib/firebase-auth.js';
import { getFirebaseAdminServices } from './_lib/firebase-admin.js';
import { createRuntimeFetchHandler } from './_lib/runtime-handler.js';
import {
  createTemporaryUploadAuthorization,
  safeTemporaryFileName,
  type TemporaryUploadAuthorization,
} from './_lib/supabase-storage.js';

interface UploadRequestInput {
  fileName: string;
  contentType: string;
  size: number;
}

export interface UploadHandlerDependencies {
  verifyIdToken: VerifyIdToken;
  remainingAnalyses(principal: VerifiedPrincipal): Promise<number>;
  authorize(
    principal: VerifiedPrincipal,
    fileName: string,
  ): Promise<TemporaryUploadAuthorization>;
}

const defaultDependencies: UploadHandlerDependencies = {
  verifyIdToken: (token, checkRevoked) =>
    getFirebaseAdminServices().auth.verifyIdToken(token, checkRevoked),
  remainingAnalyses: async (principal) =>
    (await new AnalysisRepository(getFirebaseAdminServices().firestore).usage(principal)).remaining,
  authorize: (principal, fileName) =>
    createTemporaryUploadAuthorization(principal.uid, fileName),
};

async function readInput(request: Request): Promise<UploadRequestInput> {
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > 4_096) {
    throw new ApiError(413, 'ANALYSIS_INPUT_INVALID', 'The upload request is too large.');
  }

  let input: Record<string, unknown>;
  try {
    input = await request.json() as Record<string, unknown>;
  } catch {
    throw new ApiError(400, 'ANALYSIS_INPUT_INVALID', 'The upload request is invalid.');
  }

  if (
    input.uid !== undefined ||
    input.userId !== undefined ||
    input.plan !== undefined ||
    input.storagePath !== undefined
  ) {
    throw new ApiError(
      400,
      'CLIENT_UID_FORBIDDEN',
      'User identity and upload paths must come from the verified server session.',
    );
  }

  const fileName = safeTemporaryFileName(input.fileName);
  const contentType = typeof input.contentType === 'string' ? input.contentType : '';
  const size = Number(input.size);
  validateUploadMetadata(size, contentType);
  return { fileName, contentType: normalizeAudioType(contentType), size };
}

export async function handleUploadRequest(
  request: Request,
  dependencies: UploadHandlerDependencies = defaultDependencies,
): Promise<Response> {
  const requestId = createRequestId();
  try {
    if (request.method !== 'POST') {
      throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Only POST is allowed.');
    }
    const principal = await authenticateRequest(request, dependencies.verifyIdToken);
    const input = await readInput(request);

    // Refuse before minting. Quota is only reserved in /api/analysis, so without
    // this a user at their limit can mint unlimited tokens and push unlimited
    // bytes into the bucket for uploads that can never be analyzed. A read-only
    // check rather than a reservation: reserving here is what stranded quota on
    // abandoned uploads previously.
    if (await dependencies.remainingAnalyses(principal) <= 0) {
      throw new ApiError(
        429,
        'USAGE_LIMIT_REACHED',
        'Monthly analysis limit reached. Upgrade or wait for the next period.',
      );
    }

    const authorization = await dependencies.authorize(principal, input.fileName);
    return jsonResponse({ ...authorization, contentType: input.contentType }, 200, requestId);
  } catch (error) {
    const response = errorResponse(error, requestId);
    if (error instanceof ApiError && error.status === 405) response.headers.set('allow', 'POST');
    return response;
  }
}

export default {
  fetch: createRuntimeFetchHandler(handleUploadRequest),
};
