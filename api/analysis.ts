import {
  ApiError,
  createRequestId,
  errorResponse,
  jsonResponse,
} from './_lib/api-errors.js';
import {
  assertGeminiFileName,
  assertUploadMatchesReservation,
  readReportedDuration,
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
import {
  analyzeAudioWithGemini,
  deleteUploadedFile,
  getUploadedFile,
  type UploadedFile,
} from './_lib/gemini-analyzer.js';
import { createRuntimeFetchHandler } from './_lib/runtime-handler.js';
import type {
  AnalysisUsageSummary,
  SavedAnalysisReport,
  SalesCallAnalysisReport,
} from '../types.js';

type GeneratedReport = Omit<SalesCallAnalysisReport, 'id' | 'timestamp'>;

export interface AnalysisHandlerDependencies {
  verifyIdToken: VerifyIdToken;
  loadReservation(uid: string, reservationId: string): Promise<ReservedUpload>;
  getUploadedFile(name: string): Promise<UploadedFile>;
  deleteUploadedFile(name: string): Promise<void>;
  analyze(file: UploadedFile, mimeType: string): Promise<GeneratedReport>;
  complete(reservation: ReservedUpload, report: SavedAnalysisReport): Promise<void>;
  release(reservation: ReservedUpload): Promise<void>;
  usage(principal: VerifiedPrincipal): Promise<AnalysisUsageSummary>;
}

function repository() {
  return new AnalysisRepository(getFirebaseAdminServices().firestore);
}

const defaultDependencies: AnalysisHandlerDependencies = {
  verifyIdToken: (token, checkRevoked) =>
    getFirebaseAdminServices().auth.verifyIdToken(token, checkRevoked),
  loadReservation: (uid, reservationId) => repository().loadReservation(uid, reservationId),
  getUploadedFile,
  deleteUploadedFile,
  analyze: analyzeAudioWithGemini,
  complete: (reservation, report) => repository().complete(reservation, report),
  release: (reservation) => repository().release(reservation),
  usage: (principal) => repository().usage(principal),
};

function safeFileName(value: unknown): string {
  if (typeof value !== 'string') return 'Sales call';
  const normalized = value.replace(/[\x00-\x1f/\\]/g, ' ').trim().slice(0, 180);
  return normalized || 'Sales call';
}

interface AnalysisInput {
  reservationId: unknown;
  fileName: unknown;
  originalName: string;
  durationSeconds: number | null;
}

async function readInput(request: Request): Promise<AnalysisInput> {
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

  return {
    reservationId: input.reservationId,
    fileName: input.fileName,
    originalName: safeFileName(input.originalName),
    durationSeconds: readReportedDuration(input.durationSeconds),
  };
}

/**
 * Analyzes audio the browser uploaded straight to Gemini.
 *
 * The bytes never pass through this function, which is what lets a 50 MB file
 * work at all under Vercel's 4.5 MB request body cap. Two checks replace the
 * ownership guarantee that a UID-scoped storage path used to provide:
 *
 *   - the reservation is read under the caller's own UID, so another user's
 *     reservation ID resolves to nothing;
 *   - the file's displayName must match the nonce recorded on that reservation,
 *     which only this server ever knew.
 *
 * The uploaded file is deleted in every exit path, including rejections, so a
 * refused upload cannot linger in the project's Gemini file store.
 */
export async function handleAnalysisRequest(
  request: Request,
  dependencies: AnalysisHandlerDependencies = defaultDependencies,
): Promise<Response> {
  const requestId = createRequestId();
  let geminiFileName: string | null = null;
  let reservation: ReservedUpload | null = null;
  let completed = false;

  try {
    if (request.method !== 'POST') {
      throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Only POST is allowed.');
    }
    const principal = await authenticateRequest(request, dependencies.verifyIdToken);
    const input = await readInput(request);
    geminiFileName = assertGeminiFileName(input.fileName);

    if (typeof input.reservationId !== 'string') {
      throw new ApiError(400, 'ANALYSIS_INPUT_INVALID', 'The analysis request is invalid.');
    }
    reservation = await dependencies.loadReservation(principal.uid, input.reservationId);

    const file = await dependencies.getUploadedFile(geminiFileName);
    assertUploadMatchesReservation(file, reservation);

    const generated = await dependencies.analyze(file, reservation.contentType);
    const report: SavedAnalysisReport = {
      ...generated,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      fileName: input.originalName,
      durationSeconds: input.durationSeconds,
    };
    await dependencies.complete(reservation, report);
    completed = true;
    const usage = await dependencies.usage(principal);
    return jsonResponse({ report, usage }, 200, requestId);
  } catch (error) {
    const response = errorResponse(error, requestId);
    if (error instanceof ApiError && error.status === 405) {
      response.headers.set('allow', 'POST');
    }
    return response;
  } finally {
    if (reservation && !completed) {
      await dependencies.release(reservation).catch(() => undefined);
    }
    if (geminiFileName) {
      await dependencies.deleteUploadedFile(geminiFileName).catch(() => undefined);
    }
  }
}

export default {
  fetch: createRuntimeFetchHandler(handleAnalysisRequest),
};
