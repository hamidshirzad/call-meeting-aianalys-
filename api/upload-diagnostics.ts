import { ApiError, createRequestId, errorResponse, jsonResponse } from './_lib/api-errors.js';
import { authenticateRequest, type VerifyIdToken } from './_lib/firebase-auth.js';
import { getFirebaseAdminServices } from './_lib/firebase-admin.js';
import { createRuntimeFetchHandler } from './_lib/runtime-handler.js';

export interface UploadDiagnosticDependencies {
  verifyIdToken: VerifyIdToken;
  record(details: { status: number; category: string; reason: string; requestId: string }): void;
}

const defaultDependencies: UploadDiagnosticDependencies = {
  verifyIdToken: (token, checkRevoked) =>
    getFirebaseAdminServices().auth.verifyIdToken(token, checkRevoked),
  record: ({ status, category, reason, requestId }) => {
    console.warn('[api] temporary upload failed', { requestId, status, category, reason });
  },
};

export async function handleUploadDiagnosticRequest(
  request: Request,
  dependencies: UploadDiagnosticDependencies = defaultDependencies,
): Promise<Response> {
  const requestId = createRequestId();
  try {
    if (request.method !== 'POST') {
      throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Only POST is allowed.');
    }
    await authenticateRequest(request, dependencies.verifyIdToken);
    const input = await request.json() as Record<string, unknown>;
    const status = Number(input.status);
    const category = typeof input.category === 'string' ? input.category : '';
    const reason = typeof input.reason === 'string' ? input.reason : '';
    if (!Number.isInteger(status) || status < 0 || status > 599 ||
      !['network', 'http', 'client'].includes(category) ||
      !['duplicate', 'file_size', 'mime_type', 'bucket', 'signature', 'metadata', 'unknown']
        .includes(reason)) {
      throw new ApiError(400, 'ANALYSIS_INPUT_INVALID', 'The upload diagnostic is invalid.');
    }
    dependencies.record({ status, category, reason, requestId });
    return jsonResponse({ recorded: true }, 202, requestId);
  } catch (error) {
    const response = errorResponse(error, requestId);
    if (error instanceof ApiError && error.status === 405) response.headers.set('allow', 'POST');
    return response;
  }
}

export default {
  fetch: createRuntimeFetchHandler(handleUploadDiagnosticRequest),
};
