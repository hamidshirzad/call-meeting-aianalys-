import { unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseFile } from 'music-metadata';
import { ApiError, createRequestId, errorResponse, jsonResponse } from './_lib/api-errors.js';
import {
  assertOwnedUploadPath,
  normalizeAudioType,
  validateAudioDuration,
  validateUploadMetadata,
} from './_lib/analysis-policy.js';
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
  startAudioAnalysisWithGemini,
  GEMINI_REQUEST_FEATURES,
  geminiProviderDiagnostic,
  geminiProviderStatus,
  type GeminiAnalysisStage,
} from './_lib/gemini-analyzer.js';
import { createRuntimeFetchHandler } from './_lib/runtime-handler.js';
import {
  deleteTemporaryUpload,
  downloadTemporaryUpload,
  inspectTemporaryUpload,
} from './_lib/supabase-storage.js';
import type { AnalysisUsageSummary } from '../types.js';

export interface UploadMetadata {
  size: number;
  contentType: string;
}

export interface AnalysisHandlerDependencies {
  verifyIdToken: VerifyIdToken;
  inspectUpload(path: string): Promise<UploadMetadata>;
  downloadUpload(path: string, destination: string): Promise<void>;
  deleteUpload(path: string): Promise<void>;
  readDuration(path: string): Promise<number | null>;
  reserve(principal: VerifiedPrincipal, reservationId: string): Promise<UsageReservation>;
  startAnalysis(
    path: string,
    mimeType: string,
    onStage?: (stage: GeminiAnalysisStage) => void,
  ): Promise<{ interactionId: string; geminiFileName: string }>;
  createJob(job: AnalysisJob): Promise<void>;
  deleteGeminiFile(name: string): Promise<void>;
  release(reservation: UsageReservation): Promise<void>;
  usage(principal: VerifiedPrincipal): Promise<AnalysisUsageSummary>;
  removeLocalFile(path: string): Promise<void>;
}

/**
 * Reads audio duration, or null when the container cannot be identified.
 *
 * Duration is optional display metadata — validateAudioDuration(null) is a
 * no-op. The temp file is written without an extension, so music-metadata
 * sniffs content and throws on anything it cannot parse; letting that propagate
 * would fail an analysis Gemini could have handled perfectly well.
 */
export async function readAudioDurationSeconds(path: string): Promise<number | null> {
  try {
    const metadata = await parseFile(path, { duration: true });
    const duration = metadata.format.duration;
    return typeof duration === 'number' && Number.isFinite(duration) ? duration : null;
  } catch {
    return null;
  }
}

function repository() {
  return new AnalysisRepository(getFirebaseAdminServices().firestore);
}

const defaultDependencies: AnalysisHandlerDependencies = {
  verifyIdToken: (token, checkRevoked) =>
    getFirebaseAdminServices().auth.verifyIdToken(token, checkRevoked),
  inspectUpload: inspectTemporaryUpload,
  downloadUpload: downloadTemporaryUpload,
  deleteUpload: deleteTemporaryUpload,
  readDuration: readAudioDurationSeconds,
  reserve: (principal, reservationId) => repository().reserve(principal, reservationId),
  startAnalysis: startAudioAnalysisWithGemini,
  createJob: (job) => repository().createJob(job),
  deleteGeminiFile: deleteGeminiAnalysisFile,
  release: (reservation) => repository().release(reservation),
  usage: (principal) => repository().usage(principal),
  removeLocalFile: async (path) => {
    await unlink(path).catch(() => undefined);
  },
};

function safeFileName(value: unknown): string {
  if (typeof value !== 'string') return 'Sales call';
  const normalized = value.replace(/[\u0000-\u001f/\\]/g, ' ').trim().slice(0, 180);
  return normalized || 'Sales call';
}

function logAnalysisStage(requestId: string, stage: string): void {
  // Fixed stage labels and an opaque request ID are the only log fields. Never
  // log the UID, object path, filename, transcript, or provider response.
  console.info('analysis_stage', { requestId, stage });
}

function providerFailure(error: unknown, requestId: string): ApiError {
  const status = geminiProviderStatus(error);
  const diagnostic = geminiProviderDiagnostic(error);
  const category = status === 429
    ? 'rate_limited'
    : status !== null && status >= 500
      ? 'provider_unavailable'
      : status === 400 || status === 422
        ? 'request_rejected'
        : 'unknown';

  // Every field here is a fixed enum, an HTTP status, an allowlisted API field
  // path, or our own request flags. The provider message and body can carry
  // request details and never enter application logs.
  console.warn('analysis_provider_failure', {
    requestId,
    providerStatus: status,
    category,
    reason: diagnostic.reason,
    canonicalStatus: diagnostic.canonicalStatus,
    fieldPath: diagnostic.fieldPath,
    requestFeatures: GEMINI_REQUEST_FEATURES,
  });

  if (status === 429) {
    return new ApiError(
      503,
      'ANALYSIS_PROVIDER_BUSY',
      'The AI service is busy right now. Your analysis was not charged; please wait a minute and retry.',
    );
  }

  // Only a proven media problem may blame the recording. Every other rejection
  // is a request the service refused for reasons the customer cannot act on,
  // and telling them to re-export their audio would send them in circles.
  if ((status === 400 || status === 422) && diagnostic.reason === 'media_format') {
    return new ApiError(
      422,
      'ANALYSIS_AUDIO_UNREADABLE',
      'The AI service could not read this audio file. Try exporting it as MP3, M4A, or WAV.',
    );
  }
  if (status === 400 || status === 422) {
    return new ApiError(
      502,
      'ANALYSIS_PROVIDER_FAILED',
      'The AI service rejected this analysis request. Your analysis was not charged and the recording was not the cause; this has been logged for us to fix.',
    );
  }
  return new ApiError(
    502,
    'ANALYSIS_PROVIDER_FAILED',
    'The AI service could not finish this analysis. Your analysis was not charged; please try again.',
  );
}

async function readInput(request: Request): Promise<{ storagePath: unknown; originalName: string }> {
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > 4_096) {
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
  return { storagePath: input.storagePath, originalName: safeFileName(input.originalName) };
}

/**
 * Processes audio from a private, UID-scoped Supabase object.
 *
 * The browser receives only a short-lived signed upload token. This function
 * verifies the path against the authenticated Firebase UID, validates the real
 * object metadata and duration, reserves quota transactionally, and deletes
 * Supabase, local, and Gemini temporary copies on every exit path.
 */
export async function handleAnalysisRequest(
  request: Request,
  dependencies: AnalysisHandlerDependencies = defaultDependencies,
): Promise<Response> {
  const requestId = createRequestId();
  let storagePath: string | null = null;
  let localPath: string | null = null;
  let reservation: UsageReservation | null = null;
  let geminiFileName: string | null = null;
  let handedOff = false;

  try {
    if (request.method !== 'POST') {
      throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Only POST is allowed.');
    }
    const principal = await authenticateRequest(request, dependencies.verifyIdToken);
    logAnalysisStage(requestId, 'authenticated');
    const input = await readInput(request);
    storagePath = assertOwnedUploadPath(input.storagePath, principal.uid);
    const upload = await dependencies.inspectUpload(storagePath);
    validateUploadMetadata(upload.size, upload.contentType);
    logAnalysisStage(requestId, 'upload_inspected');

    reservation = await dependencies.reserve(principal, requestId);
    logAnalysisStage(requestId, 'quota_reserved');
    localPath = join(tmpdir(), `${requestId}-audio`);
    await dependencies.downloadUpload(storagePath, localPath);
    logAnalysisStage(requestId, 'upload_downloaded');
    const durationSeconds = await dependencies.readDuration(localPath);
    validateAudioDuration(durationSeconds);

    let started: { interactionId: string; geminiFileName: string };
    try {
      started = await dependencies.startAnalysis(
        localPath,
        normalizeAudioType(upload.contentType),
        (stage) => logAnalysisStage(requestId, stage),
      );
    } catch (error) {
      throw providerFailure(error, requestId);
    }
    geminiFileName = started.geminiFileName;
    const job: AnalysisJob = {
      id: requestId,
      uid: principal.uid,
      status: 'processing',
      interactionId: started.interactionId,
      geminiFileName: started.geminiFileName,
      originalName: input.originalName,
      durationSeconds,
      reservation,
    };
    await dependencies.createJob(job);
    handedOff = true;
    geminiFileName = null;
    logAnalysisStage(requestId, 'job_saved');
    const usage = await dependencies.usage(principal);
    return jsonResponse({ jobId: job.id, status: 'processing', usage }, 202, requestId);
  } catch (error) {
    const response = errorResponse(error, requestId);
    if (error instanceof ApiError && error.status === 405) response.headers.set('allow', 'POST');
    return response;
  } finally {
    if (reservation && !handedOff) {
      await dependencies.release(reservation).catch(() => undefined);
    }
    if (geminiFileName) {
      await dependencies.deleteGeminiFile(geminiFileName).catch(() => undefined);
    }
    if (localPath) {
      await dependencies.removeLocalFile(localPath).catch(() => undefined);
    }
    if (storagePath) {
      await dependencies.deleteUpload(storagePath).catch(() => undefined);
    }
  }
}

export default {
  fetch: createRuntimeFetchHandler(handleAnalysisRequest),
};
