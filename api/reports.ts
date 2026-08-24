import {
  ApiError,
  createRequestId,
  errorResponse,
  jsonResponse,
} from './_lib/api-errors.js';
import { AnalysisRepository } from './_lib/analysis-repository.js';
import {
  authenticateRequest,
  type VerifiedPrincipal,
  type VerifyIdToken,
} from './_lib/firebase-auth.js';
import { getFirebaseAdminServices } from './_lib/firebase-admin.js';
import { createRuntimeFetchHandler } from './_lib/runtime-handler.js';
import type { AnalysisUsageSummary, SavedAnalysisReport } from '../types.js';

export interface ReportsHandlerDependencies {
  verifyIdToken: VerifyIdToken;
  list(principal: VerifiedPrincipal): Promise<SavedAnalysisReport[]>;
  usage(principal: VerifiedPrincipal): Promise<AnalysisUsageSummary>;
  delete(uid: string, reportId: string): Promise<void>;
}

function repository() {
  return new AnalysisRepository(getFirebaseAdminServices().firestore);
}

const defaultDependencies: ReportsHandlerDependencies = {
  verifyIdToken: (token, checkRevoked) =>
    getFirebaseAdminServices().auth.verifyIdToken(token, checkRevoked),
  list: (principal) => repository().listReports(principal.uid),
  usage: (principal) => repository().usage(principal),
  delete: (uid, reportId) => repository().deleteReport(uid, reportId),
};

async function readReportId(request: Request): Promise<string> {
  try {
    const input = await request.json() as Record<string, unknown>;
    if (input.uid !== undefined || input.userId !== undefined) {
      throw new ApiError(400, 'CLIENT_UID_FORBIDDEN', 'User identity comes from Firebase.');
    }
    if (typeof input.reportId !== 'string') throw new Error('invalid');
    return input.reportId;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, 'REPORT_ID_INVALID', 'The report ID is invalid.');
  }
}

export async function handleReportsRequest(
  request: Request,
  dependencies: ReportsHandlerDependencies = defaultDependencies,
): Promise<Response> {
  const requestId = createRequestId();
  try {
    if (!['GET', 'DELETE'].includes(request.method)) {
      throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Only GET and DELETE are allowed.');
    }
    const principal = await authenticateRequest(request, dependencies.verifyIdToken);
    if (request.method === 'DELETE') {
      await dependencies.delete(principal.uid, await readReportId(request));
      return jsonResponse({ deleted: true }, 200, requestId);
    }

    const [reports, usage] = await Promise.all([
      dependencies.list(principal),
      dependencies.usage(principal),
    ]);
    return jsonResponse({ reports, usage }, 200, requestId);
  } catch (error) {
    const response = errorResponse(error, requestId);
    if (error instanceof ApiError && error.status === 405) {
      response.headers.set('allow', 'GET, DELETE');
    }
    return response;
  }
}

export default {
  fetch: createRuntimeFetchHandler(handleReportsRequest),
};
