import { ApiError } from './api-errors.js';

export const MAX_AUDIO_BYTES = 50 * 1024 * 1024;
export const MAX_AUDIO_DURATION_SECONDS = 60 * 60;
export const FREE_MONTHLY_ANALYSIS_LIMIT = 5;
export const PRO_MONTHLY_ANALYSIS_LIMIT = 50;

const supportedAudioTypes = new Set([
  'audio/aac',
  'audio/aiff',
  'audio/flac',
  'audio/m4a',
  'audio/mp3',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
  'audio/x-aiff',
  'audio/x-m4a',
  'audio/x-wav',
]);

export function isSupportedAudioType(contentType: string): boolean {
  return supportedAudioTypes.has(contentType.toLowerCase().split(';', 1)[0].trim());
}

export function normalizeAudioType(contentType: string): string {
  const normalized = contentType.toLowerCase().split(';', 1)[0].trim();
  if (normalized === 'audio/x-wav') return 'audio/wav';
  if (normalized === 'audio/x-aiff') return 'audio/aiff';
  if (normalized === 'audio/x-m4a' || normalized === 'audio/mp4') return 'audio/m4a';
  if (normalized === 'audio/mp3') return 'audio/mpeg';
  return normalized;
}

export function assertOwnedUploadPath(path: unknown, uid: string): string {
  if (typeof path !== 'string' || path.length > 320) {
    throw new ApiError(400, 'ANALYSIS_INPUT_INVALID', 'Select an audio file to analyze.');
  }

  const prefix = `users/${uid}/uploads/`;
  const fileName = path.slice(prefix.length);
  if (
    !path.startsWith(prefix) ||
    !fileName ||
    fileName.includes('/') ||
    fileName.includes('..') ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,180}$/.test(fileName)
  ) {
    throw new ApiError(
      403,
      'ANALYSIS_UPLOAD_INVALID',
      'The uploaded audio does not belong to this account.',
    );
  }

  return path;
}

export function validateUploadMetadata(size: number, contentType: string): void {
  if (!Number.isFinite(size) || size <= 0 || !isSupportedAudioType(contentType)) {
    throw new ApiError(
      415,
      'ANALYSIS_UPLOAD_INVALID',
      'Upload a supported audio file.',
    );
  }

  if (size > MAX_AUDIO_BYTES) {
    throw new ApiError(
      413,
      'ANALYSIS_UPLOAD_TOO_LARGE',
      'Audio files must be 50 MB or smaller.',
    );
  }
}

export function validateAudioDuration(durationSeconds: number | null): void {
  if (durationSeconds !== null && durationSeconds > MAX_AUDIO_DURATION_SECONDS) {
    throw new ApiError(
      413,
      'ANALYSIS_AUDIO_TOO_LONG',
      'Audio must be 60 minutes or shorter.',
    );
  }
}

export function usagePeriod(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}
