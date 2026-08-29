import type { User } from 'firebase/auth';
import {
  canceledUpload,
  describeUploadFailure,
  stalledUpload,
  STORAGE_UPLOAD_STALL_MS,
} from './upload-error';
import type { AnalysisUsageSummary, SavedAnalysisReport } from '../types';

const MAX_AUDIO_BYTES = 50 * 1024 * 1024;
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
    return 'Call analysis is temporarily unavailable while the AI service is being connected. Your audio was not uploaded and this did not use an analysis.';
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

/**
 * Reads the audio's duration in the browser.
 *
 * The server never receives the bytes, so it cannot measure this itself. Purely
 * display metadata — the server bounds whatever arrives and enforces the real
 * limit on size, which it verifies against Gemini independently.
 */
export function readAudioDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    // Never let a duration read break an upload: it is display metadata, and a
    // codec the browser cannot decode is still one Gemini may handle fine.
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

/**
 * Sends the audio to the URL the server minted, and returns the Gemini file name.
 *
 * XMLHttpRequest rather than fetch because it reports upload progress, which
 * fetch still cannot do. The bytes go straight to Google — no API key is needed
 * here, since the URL itself carries the upload session.
 */
export function putAudioToUploadUrl(
  uploadUrl: string,
  file: File,
  contentType: string,
  onProgress?: (percentage: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    let lastLoaded = 0;
    let stallTimer: ReturnType<typeof setTimeout> | null = null;

    const clearStallTimer = () => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = null;
    };
    const fail = (diagnostic: { code: string; message: string }) => {
      clearStallTimer();
      reject(new AnalysisApiError(diagnostic.message, diagnostic.code));
    };
    const resetStallTimer = () => {
      clearStallTimer();
      stallTimer = setTimeout(() => {
        // Reject before aborting: abort fires its own handler, and the first
        // settle wins. Rejecting first is what surfaces "stalled" to the user
        // rather than the "canceled" the abort would otherwise report.
        fail(stalledUpload);
        request.abort();
      }, STORAGE_UPLOAD_STALL_MS);
    };

    request.upload.onprogress = (event) => {
      if (event.loaded > lastLoaded) {
        lastLoaded = event.loaded;
        resetStallTimer();
      }
      onProgress?.(
        event.lengthComputable && event.total > 0
          ? Math.round((event.loaded / event.total) * 100)
          : 0,
      );
    };
    request.onerror = () => fail(describeUploadFailure(null));
    request.ontimeout = () => fail(stalledUpload);
    request.onabort = () => fail(canceledUpload);
    request.onload = () => {
      clearStallTimer();
      if (request.status < 200 || request.status >= 300) {
        return fail(describeUploadFailure(request.status));
      }
      try {
        const name = JSON.parse(request.responseText)?.file?.name;
        if (typeof name !== 'string' || !name) {
          return fail(describeUploadFailure(null));
        }
        onProgress?.(100);
        resolve(name);
      } catch {
        fail(describeUploadFailure(null));
      }
    };

    request.open('PUT', uploadUrl, true);
    request.setRequestHeader('X-Goog-Upload-Command', 'upload, finalize');
    request.setRequestHeader('X-Goog-Upload-Offset', '0');
    request.setRequestHeader('Content-Type', contentType);
    resetStallTimer();
    request.send(file);
  });
}

interface UploadTicket {
  uploadUrl: string;
  reservationId: string;
}

/** Where an in-flight analysis currently is, for user-facing progress. */
export type UploadPhase = 'preparing' | 'uploading' | 'analyzing';

/**
 * Uploads a call and returns its analysis.
 *
 * Three steps: ask the server to authorize the upload and mint a URL, send the
 * bytes straight to Gemini, then ask the server to analyze what was uploaded.
 * The audio never passes through our own API, which is what allows files far
 * above the platform's request body limit.
 */
export async function analyzeAudio(
  user: User,
  file: File,
  onProgress?: (percentage: number) => void,
  onPhase?: (phase: UploadPhase) => void,
): Promise<AnalysisResult> {
  const contentType = validateClientAudioFile(file);

  // Authorizing the upload is a real server round-trip before any byte moves.
  // Without this the user waits on a silent, apparently-stuck 0%.
  onPhase?.('preparing');
  const ticket = await authenticatedJson<UploadTicket>(
    user,
    // Must match api/analysis-upload-url.ts: Vercel maps files to routes
    // literally, so a nested-looking path would 404 in production.
    '/api/analysis-upload-url',
    'POST',
    { size: file.size, contentType },
  );

  onPhase?.('uploading');
  const fileName = await putAudioToUploadUrl(ticket.uploadUrl, file, contentType, onProgress);

  onPhase?.('analyzing');
  return authenticatedJson<AnalysisResult>(user, '/api/analysis', 'POST', {
    reservationId: ticket.reservationId,
    fileName,
    originalName: file.name,
    durationSeconds: await readAudioDuration(file),
  });
}

export async function fetchReports(user: User): Promise<ReportsResult> {
  return authenticatedJson<ReportsResult>(user, '/api/reports', 'GET');
}

export async function deleteReport(user: User, reportId: string): Promise<void> {
  await authenticatedJson<{ deleted: true }>(user, '/api/reports', 'DELETE', { reportId });
}
