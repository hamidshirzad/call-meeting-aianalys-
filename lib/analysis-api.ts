import type { User } from 'firebase/auth';
import { DetailedError, Upload } from 'tus-js-client';
import type { AnalysisUsageSummary, SavedAnalysisReport } from '../types';

const MAX_AUDIO_BYTES = 50 * 1024 * 1024;
const UPLOAD_CHUNK_BYTES = 6 * 1024 * 1024;
const UPLOAD_STALL_MS = 2 * 60 * 1000;
const supportedTypes = new Set([
  'audio/aac', 'audio/aiff', 'audio/flac', 'audio/m4a', 'audio/mp3', 'audio/mp4',
  'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/x-aiff', 'audio/x-m4a',
  'audio/x-wav',
]);

interface ApiErrorBody {
  error?: { code?: string; message?: string; requestId?: string };
}

export interface AnalysisResult {
  report: SavedAnalysisReport;
  usage: AnalysisUsageSummary;
}

export interface ReportsResult {
  reports: SavedAnalysisReport[];
  usage: AnalysisUsageSummary;
}

interface UploadAuthorization {
  storagePath: string;
  token: string;
  uploadEndpoint: string;
  bucket: string;
  contentType: string;
}

interface AnalysisJobStart {
  jobId: string;
  status: 'processing';
  usage: AnalysisUsageSummary;
}

type AnalysisJobStatus =
  | { jobId: string; status: 'processing' }
  | { status: 'completed'; report: SavedAnalysisReport; usage: AnalysisUsageSummary };

const ANALYSIS_POLL_INTERVAL_MS = 2_000;
const ANALYSIS_POLL_ATTEMPTS = 150;

export class AnalysisApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly requestId: string | null = null,
  ) {
    super(message);
    this.name = 'AnalysisApiError';
  }
}

export function describeAnalysisError(error: unknown): string {
  if (error instanceof AnalysisApiError && error.code === 'SERVER_NOT_CONFIGURED') {
    return 'Call analysis is temporarily unavailable while secure storage is being connected. Your audio was not retained and this did not use an analysis.';
  }
  if (error instanceof TypeError && /load failed|failed to fetch|network/i.test(error.message)) {
    return 'The connection ended before the report was ready. Your analysis allowance will be restored automatically; please retry with a short audio file.';
  }
  return error instanceof Error ? error.message : 'The call could not be analyzed.';
}

function inferredAudioType(file: File): string {
  if (file.type) return file.type.toLowerCase();
  const extension = file.name.split('.').pop()?.toLowerCase();
  const types: Record<string, string> = {
    aac: 'audio/aac', aiff: 'audio/aiff', flac: 'audio/flac', m4a: 'audio/m4a',
    mp3: 'audio/mpeg', mp4: 'audio/mp4', ogg: 'audio/ogg', wav: 'audio/wav',
    webm: 'audio/webm',
  };
  return extension ? types[extension] ?? '' : '';
}

export function validateClientAudioFile(file: File): string {
  const contentType = inferredAudioType(file);
  if (!supportedTypes.has(contentType)) {
    throw new AnalysisApiError('Choose a supported audio file.', 'ANALYSIS_UPLOAD_INVALID');
  }
  if (file.size <= 0 || file.size > MAX_AUDIO_BYTES) {
    throw new AnalysisApiError('Audio files must be 50 MB or smaller.', 'ANALYSIS_UPLOAD_TOO_LARGE');
  }
  return contentType;
}

export function describeTusUploadFailure(error: unknown): {
  status: number;
  category: 'network' | 'http' | 'client';
  reason: UploadFailureReason;
  message: string;
} {
  const status = error instanceof DetailedError && error.originalResponse
    ? error.originalResponse.getStatus()
    : 0;
  const responseBody = error instanceof DetailedError && error.originalResponse
    ? error.originalResponse.getBody().toLowerCase()
    : '';
  const reason = classifyUploadFailure(responseBody);
  if (status === 401 || status === 403) {
    return { status, category: 'http', reason, message: 'The secure upload permission was rejected. Please try again.' };
  }
  if (status === 404) {
    return { status, category: 'http', reason, message: 'The private upload bucket was not found.' };
  }
  if (status === 409) {
    return { status, category: 'http', reason, message: 'This upload session conflicted with another attempt. Please retry.' };
  }
  if (status >= 400) {
    return { status, category: 'http', reason, message: `The storage service rejected the upload (HTTP ${status}).` };
  }
  if (error instanceof Error) {
    return { status: 0, category: 'network', reason, message: 'The browser could not reach secure storage. Check your connection and try again.' };
  }
  return { status: 0, category: 'client', reason, message: 'The audio upload could not start. Please try again.' };
}

export type UploadFailureReason =
  | 'duplicate'
  | 'file_size'
  | 'mime_type'
  | 'bucket'
  | 'signature'
  | 'metadata'
  | 'unknown';

export function classifyUploadFailure(responseBody: string): UploadFailureReason {
  const body = responseBody.toLowerCase().slice(0, 2_000);
  if (/already exists|duplicate/.test(body)) return 'duplicate';
  if (/too large|entitytoolarge|file.?size|maximum.*size|payload.*large/.test(body)) return 'file_size';
  if (/mime|content.?type|media.?type/.test(body)) return 'mime_type';
  if (/bucket|not found/.test(body)) return 'bucket';
  if (/signature|token|jwt|unauthori[sz]ed|forbidden/.test(body)) return 'signature';
  if (/metadata|invalid request|invalid.*upload|tus/.test(body)) return 'metadata';
  return 'unknown';
}

async function reportUploadFailure(
  user: User,
  details: { status: number; category: string; reason: UploadFailureReason },
): Promise<void> {
  try {
    const token = await user.getIdToken();
    await fetch('/api/upload-diagnostics', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(details),
      cache: 'no-store',
    });
  } catch {
    // Diagnostics must never replace or delay the original upload error.
  }
}

async function authenticatedJson<T>(
  user: User,
  path: string,
  method: 'GET' | 'POST' | 'DELETE',
  body?: Record<string, unknown>,
): Promise<T> {
  const token = await user.getIdToken();
  const response = await fetch(path, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  let value: T | ApiErrorBody | null = null;
  try {
    value = await response.json() as T | ApiErrorBody;
  } catch {
    value = null;
  }
  if (!response.ok) {
    const error = value as ApiErrorBody | null;
    throw new AnalysisApiError(
      error?.error?.message ?? 'The call analysis could not be completed.',
      error?.error?.code ?? 'ANALYSIS_REQUEST_FAILED',
      error?.error?.requestId ?? response.headers.get('x-request-id'),
    );
  }
  return value as T;
}

export async function uploadAudio(
  user: User,
  file: File,
  onProgress?: (percentage: number) => void,
  onPhase?: (phase: UploadPhase) => void,
): Promise<string> {
  const contentType = validateClientAudioFile(file);
  // Authorizing the upload is a real server round-trip before any byte moves.
  // Reporting 'uploading' before it returns shows a stuck 0%.
  const authorization = await authenticatedJson<UploadAuthorization>(
    user,
    '/api/uploads',
    'POST',
    { fileName: file.name, contentType, size: file.size },
  );
  onPhase?.('uploading');

  await new Promise<void>((resolve, reject) => {
    let lastTransferred = 0;
    let stallTimer: ReturnType<typeof setTimeout> | null = null;
    let settled = false;

    const clearStallTimer = () => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = null;
    };
    const fail = (message: string, code: string) => {
      if (settled) return;
      settled = true;
      clearStallTimer();
      reject(new AnalysisApiError(message, code));
    };
    const resetStallTimer = () => {
      clearStallTimer();
      stallTimer = setTimeout(() => {
        void upload.abort(true).catch(() => undefined);
        fail(
          'The upload stopped making progress. Check your connection and try again.',
          'STORAGE_UPLOAD_STALLED',
        );
      }, UPLOAD_STALL_MS);
    };

    const upload = new Upload(file, {
      endpoint: authorization.uploadEndpoint,
      retryDelays: [0, 3_000, 5_000, 10_000, 20_000],
      headers: {
        'x-signature': authorization.token,
        'x-upsert': 'false',
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: authorization.bucket,
        objectName: authorization.storagePath,
        contentType: authorization.contentType,
        cacheControl: '0',
      },
      chunkSize: UPLOAD_CHUNK_BYTES,
      onProgress: (bytesUploaded, bytesTotal) => {
        if (bytesUploaded > lastTransferred) {
          lastTransferred = bytesUploaded;
          resetStallTimer();
        }
        onProgress?.(bytesTotal > 0 ? Math.round((bytesUploaded / bytesTotal) * 100) : 0);
      },
      onError: (error) => {
        const diagnostic = describeTusUploadFailure(error);
        void reportUploadFailure(user, diagnostic);
        fail(diagnostic.message, 'STORAGE_UPLOAD_FAILED');
      },
      onSuccess: () => {
        if (settled) return;
        settled = true;
        clearStallTimer();
        onProgress?.(100);
        resolve();
      },
    });

    resetStallTimer();
    upload.start();
  });
  return authorization.storagePath;
}

export type UploadPhase = 'preparing' | 'uploading' | 'analyzing';

export async function analyzeAudio(
  user: User,
  file: File,
  onProgress?: (percentage: number) => void,
  onPhase?: (phase: UploadPhase) => void,
): Promise<AnalysisResult> {
  onPhase?.('preparing');
  const storagePath = await uploadAudio(user, file, onProgress, onPhase);
  onPhase?.('analyzing');
  const started = await authenticatedJson<AnalysisJobStart>(user, '/api/analysis', 'POST', {
    storagePath,
    originalName: file.name,
  });
  for (let attempt = 0; attempt < ANALYSIS_POLL_ATTEMPTS; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, ANALYSIS_POLL_INTERVAL_MS));
    }
    try {
      const result = await authenticatedJson<AnalysisJobStatus>(
        user,
        `/api/analysis-status?jobId=${encodeURIComponent(started.jobId)}`,
        'GET',
      );
      if (result.status === 'completed') return { report: result.report, usage: result.usage };
    } catch (error) {
      // A short mobile-network interruption should not lose a server-side job.
      // Provider/API errors are authoritative and must surface immediately.
      if (!(error instanceof TypeError)) throw error;
    }
  }
  throw new AnalysisApiError(
    'The report is still processing. Refresh report history in a moment.',
    'ANALYSIS_STILL_PROCESSING',
  );
}

export async function fetchReports(user: User): Promise<ReportsResult> {
  return authenticatedJson<ReportsResult>(user, '/api/reports', 'GET');
}

export async function deleteReport(user: User, reportId: string): Promise<void> {
  await authenticatedJson<{ deleted: true }>(user, '/api/reports', 'DELETE', { reportId });
}
