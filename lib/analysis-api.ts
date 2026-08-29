import type { User } from 'firebase/auth';
import { Upload } from 'tus-js-client';
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

export function readAudioDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const audio = new Audio();
      const finish = (value: number | null) => {
        URL.revokeObjectURL(url);
        resolve(value);
      };
      audio.preload = 'metadata';
      audio.onloadedmetadata = () =>
        finish(Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : null);
      audio.onerror = () => finish(null);
      audio.src = url;
    } catch {
      resolve(null);
    }
  });
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
): Promise<string> {
  const contentType = validateClientAudioFile(file);
  const authorization = await authenticatedJson<UploadAuthorization>(
    user,
    '/api/uploads',
    'POST',
    { fileName: file.name, contentType, size: file.size },
  );

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
      onError: () => {
        fail('The audio upload failed. Check your connection and try again.', 'STORAGE_UPLOAD_FAILED');
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
  const durationPromise = readAudioDuration(file);
  onPhase?.('uploading');
  const storagePath = await uploadAudio(user, file, onProgress);
  onPhase?.('analyzing');
  await durationPromise;
  return authenticatedJson<AnalysisResult>(user, '/api/analysis', 'POST', {
    storagePath,
    originalName: file.name,
  });
}

export async function fetchReports(user: User): Promise<ReportsResult> {
  return authenticatedJson<ReportsResult>(user, '/api/reports', 'GET');
}

export async function deleteReport(user: User, reportId: string): Promise<void> {
  await authenticatedJson<{ deleted: true }>(user, '/api/reports', 'DELETE', { reportId });
}
