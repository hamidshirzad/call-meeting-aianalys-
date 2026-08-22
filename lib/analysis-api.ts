import type { User } from 'firebase/auth';
import { ref, uploadBytesResumable } from 'firebase/storage';
import { firebaseStorage } from './firebase';
import {
  describeStorageUploadFailure,
  stalledStorageUpload,
  STORAGE_UPLOAD_STALL_MS,
} from './storage-upload-error';
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

export function createUploadPath(uid: string, fileName: string): string {
  const safeName = fileName
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(-100) || 'call-audio';
  return `users/${uid}/uploads/${crypto.randomUUID()}-${safeName}`;
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

async function uploadAudio(
  user: User,
  file: File,
  onProgress?: (percentage: number) => void,
): Promise<string> {
  if (!firebaseStorage) {
    throw new AnalysisApiError('Firebase Storage is not configured.', 'STORAGE_NOT_CONFIGURED');
  }
  const contentType = validateClientAudioFile(file);
  const path = createUploadPath(user.uid, file.name);
  const task = uploadBytesResumable(ref(firebaseStorage, path), file, { contentType });
  await new Promise<void>((resolve, reject) => {
    let lastTransferred = 0;
    let stallTimer: ReturnType<typeof setTimeout> | null = null;

    const clearStallTimer = () => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = null;
    };
    const resetStallTimer = () => {
      clearStallTimer();
      stallTimer = setTimeout(() => {
        reject(new AnalysisApiError(stalledStorageUpload.message, stalledStorageUpload.code));
        task.cancel();
      }, STORAGE_UPLOAD_STALL_MS);
    };

    resetStallTimer();
    task.on(
      'state_changed',
      (snapshot) => {
        if (snapshot.bytesTransferred > lastTransferred) {
          lastTransferred = snapshot.bytesTransferred;
          resetStallTimer();
        }
        const percentage = snapshot.totalBytes > 0
          ? Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
          : 0;
        onProgress?.(percentage);
      },
      (uploadError) => {
        clearStallTimer();
        const diagnostic = describeStorageUploadFailure(uploadError);
        reject(new AnalysisApiError(diagnostic.message, diagnostic.code));
      },
      () => {
        clearStallTimer();
        resolve();
      },
    );
  });
  return path;
}

export async function analyzeAudio(
  user: User,
  file: File,
  onProgress?: (percentage: number) => void,
): Promise<AnalysisResult> {
  const storagePath = await uploadAudio(user, file, onProgress);
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
