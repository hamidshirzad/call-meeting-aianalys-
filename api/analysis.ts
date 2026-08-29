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
import { AnalysisRepository, type UsageReservation } from './_lib/analysis-repository.js';
import {
  authenticateRequest,
  type VerifiedPrincipal,
  type VerifyIdToken,
} from './_lib/firebase-auth.js';
import { getFirebaseAdminServices } from './_lib/firebase-admin.js';
import { analyzeAudioWithGemini } from './_lib/gemini-analyzer.js';
import { createRuntimeFetchHandler } from './_lib/runtime-handler.js';
import {
  deleteTemporaryUpload,
  downloadTemporaryUpload,
  inspectTemporaryUpload,
} from './_lib/supabase-storage.js';
import type {
  AnalysisUsageSummary,
  SavedAnalysisReport,
  SalesCallAnalysisReport,
} from '../types.js';

export interface UploadMetadata {
  size: number;
  contentType: string;
}

type GeneratedReport = Omit<SalesCallAnalysisReport, 'id' | 'timestamp'>;

export interface AnalysisHandlerDependencies {
  verifyIdToken: VerifyIdToken;
  inspectUpload(path: string): Promise<UploadMetadata>;
  downloadUpload(path: string, destination: string): Promise<void>;
  deleteUpload(path: string): Promise<void>;
  readDuration(path: string): Promise<number | null>;
  reserve(principal: VerifiedPrincipal, reservationId: string): Promise<UsageReservation>;
  analyze(path: string, mimeType: string): Promise<GeneratedReport>;
  complete(reservation: UsageReservation, report: SavedAnalysisReport): Promise<void>;
  release(reservation: UsageReservation): Promise<void>;
  usage(principal: VerifiedPrincipal): Promise<AnalysisUsageSummary>;
  removeLocalFile(path: string): Promise<void>;
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
  readDuration: async (path) => {
    const metadata = await parseFile(path, { duration: true });
    const duration = metadata.format.duration;
    return typeof duration === 'number' && Number.isFinite(duration) ? duration : null;
  },
  reserve: (principal, reservationId) => repository().reserve(principal, reservationId),
  analyze: analyzeAudioWithGemini,
  complete: (reservation, report) => repository().complete(reservation, report),
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
  let completed = false;

  try {
    if (request.method !== 'POST') {
      throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Only POST is allowed.');
    }
    const principal = await authenticateRequest(request, dependencies.verifyIdToken);
    const input = await readInput(request);
    storagePath = assertOwnedUploadPath(input.storagePath, principal.uid);
    const upload = await dependencies.inspectUpload(storagePath);
    validateUploadMetadata(upload.size, upload.contentType);

    reservation = await dependencies.reserve(principal, requestId);
    localPath = join(tmpdir(), `${requestId}-audio`);
    await dependencies.downloadUpload(storagePath, localPath);
    const durationSeconds = await dependencies.readDuration(localPath);
    validateAudioDuration(durationSeconds);

    const generated = await dependencies.analyze(localPath, normalizeAudioType(upload.contentType));
    const report: SavedAnalysisReport = {
      ...generated,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      fileName: input.originalName,
      durationSeconds,
    };
    await dependencies.complete(reservation, report);
    completed = true;
    const usage = await dependencies.usage(principal);
    return jsonResponse({ report, usage }, 200, requestId);
  } catch (error) {
    const response = errorResponse(error, requestId);
    if (error instanceof ApiError && error.status === 405) response.headers.set('allow', 'POST');
    return response;
  } finally {
    if (reservation && !completed) {
      await dependencies.release(reservation).catch(() => undefined);
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
