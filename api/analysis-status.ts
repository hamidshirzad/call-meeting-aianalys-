import { ApiError, createRequestId, errorResponse, jsonResponse } from './_lib/api-errors.js';
import {
  AnalysisRepository,
  type AnalysisJob,
  type UsageReservation,
} from './_lib/analysis-repository.js';
import {
  authenticateRequest,
  type VerifiedPrincipal,
  type VerifyIdToken,
} from './_lib/firebase-auth.js';
import { getFirebaseAdminServices } from './_lib/firebase-admin.js';
import {
  deleteGeminiAnalysisFile,
  geminiProviderStatus,
  getGeminiAnalysis,
  type GeminiJobResult,
} from './_lib/gemini-analyzer.js';
import { createRuntimeFetchHandler } from './_lib/runtime-handler.js';
import type { AnalysisUsageSummary, SavedAnalysisReport } from '../types.js';

export interface AnalysisStatusDependencies {
  verifyIdToken: VerifyIdToken;
  getJob(uid: string, jobId: string): Promise<AnalysisJob | null>;
  getReport(uid: string, reportId: string): Promise<SavedAnalysisReport | null>;
  getResult(interactionId: string): Promise<GeminiJobResult>;
  complete(reservation: UsageReservation, report: SavedAnalysisReport): Promise<void>;
  release(reservation: UsageReservation): Promise<void>;
  updateStatus(uid: string, jobId: string, status: AnalysisJob['status']): Promise<void>;
  deleteGeminiFile(name: string): Promise<void>;
  usage(principal: VerifiedPrincipal): Promise<AnalysisUsageSummary>;
}

function repository() {
  return new AnalysisRepository(getFirebaseAdminServices().firestore);
}

const defaultDependencies: AnalysisStatusDependencies = {
  verifyIdToken: (token, checkRevoked) =>
    getFirebaseAdminServices().auth.verifyIdToken(token, checkRevoked),
  getJob: (uid, jobId) => repository().getJob(uid, jobId),
  getReport: (uid, reportId) => repository().getReport(uid, reportId),
  getResult: getGeminiAnalysis,
  complete: (reservation, report) => repository().complete(reservation, report),
  release: (reservation) => repository().release(reservation),
  updateStatus: (uid, jobId, status) => repository().updateJobStatus(uid, jobId, status),
  deleteGeminiFile: deleteGeminiAnalysisFile,
  usage: (principal) => repository().usage(principal),
};

function jobIdFromRequest(request: Request): string {
  const jobId = new URL(request.url).searchParams.get('jobId') ?? '';
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(jobId)) {
    throw new ApiError(400, 'ANALYSIS_JOB_NOT_FOUND', 'The analysis job ID is invalid.');
  }
  return jobId;
}

async function completedResponse(
  principal: VerifiedPrincipal,
  report: SavedAnalysisReport,
  dependencies: AnalysisStatusDependencies,
  requestId: string,
): Promise<Response> {
  const usage = await dependencies.usage(principal);
  return jsonResponse({ status: 'completed', report, usage }, 200, requestId);
}

export async function handleAnalysisStatusRequest(
  request: Request,
  dependencies: AnalysisStatusDependencies = defaultDependencies,
): Promise<Response> {
  const requestId = createRequestId();
  let job: AnalysisJob | null = null;
  try {
    if (request.method !== 'GET') {
      throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Only GET is allowed.');
    }
    const principal = await authenticateRequest(request, dependencies.verifyIdToken);
    const jobId = jobIdFromRequest(request);
    job = await dependencies.getJob(principal.uid, jobId);
    if (!job || job.uid !== principal.uid) {
      throw new ApiError(404, 'ANALYSIS_JOB_NOT_FOUND', 'The analysis job was not found.');
    }

    const existingReport = await dependencies.getReport(principal.uid, job.id);
    if (existingReport) return completedResponse(principal, existingReport, dependencies, requestId);
    if (job.status === 'failed') {
      throw new ApiError(502, 'ANALYSIS_PROVIDER_FAILED', 'The AI service could not finish this analysis. Your analysis was not charged.');
    }

    let result: GeminiJobResult;
    try {
      result = await dependencies.getResult(job.interactionId);
    } catch (error) {
      console.warn('analysis_job_poll_failure', {
        requestId,
        providerStatus: geminiProviderStatus(error),
      });
      return jsonResponse({ status: 'processing', jobId: job.id }, 202, requestId);
    }
    if (result.status === 'processing') {
      return jsonResponse({ status: 'processing', jobId: job.id }, 202, requestId);
    }
    if (result.status === 'failed') {
      await dependencies.release(job.reservation);
      await dependencies.updateStatus(job.uid, job.id, 'failed');
      await dependencies.deleteGeminiFile(job.geminiFileName);
      throw new ApiError(502, 'ANALYSIS_PROVIDER_FAILED', 'The AI service could not finish this analysis. Your analysis was not charged.');
    }

    const report: SavedAnalysisReport = {
      ...result.report,
      id: job.id,
      timestamp: new Date().toISOString(),
      fileName: job.originalName,
      durationSeconds: job.durationSeconds,
    };
    try {
      await dependencies.complete(job.reservation, report);
    } catch (error) {
      const racedReport = await dependencies.getReport(principal.uid, job.id);
      if (racedReport) return completedResponse(principal, racedReport, dependencies, requestId);
      throw error;
    }
    // The report and quota transaction is authoritative. Cleanup/status metadata
    // must not turn a successful analysis into a browser-visible 500 response.
    await dependencies.updateStatus(job.uid, job.id, 'completed').catch(() => undefined);
    await dependencies.deleteGeminiFile(job.geminiFileName).catch(() => undefined);
    return completedResponse(principal, report, dependencies, requestId);
  } catch (error) {
    const response = errorResponse(error, requestId);
    if (error instanceof ApiError && error.status === 405) response.headers.set('allow', 'GET');
    return response;
  }
}

export default {
  fetch: createRuntimeFetchHandler(handleAnalysisStatusRequest),
};
