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

/** Gemini file resource names look like `files/abc123`. */
export function assertGeminiFileName(value: unknown): string {
  if (typeof value !== 'string' || !/^files\/[a-z0-9]{4,64}$/.test(value)) {
    throw new ApiError(400, 'ANALYSIS_INPUT_INVALID', 'Select an audio file to analyze.');
  }
  return value;
}

/**
 * Proves an uploaded file belongs to the reservation that paid for it.
 *
 * Gemini file names are project-wide, so a client naming an arbitrary file could
 * otherwise reach another user's audio. The nonce was written into displayName
 * when the upload URL was minted and never left the server, so only the client
 * that received that URL can produce a file carrying it.
 *
 * Size is re-checked here against what Gemini actually received. Once the server
 * stops seeing the bytes this is the only place the 50 MB cap can be enforced
 * for real, rather than trusted from the client's declared size.
 */
export function assertUploadMatchesReservation(
  file: { displayName: string | null; sizeBytes: number },
  reservation: { geminiNonce: string; declaredSize: number },
): void {
  if (!reservation.geminiNonce || file.displayName !== reservation.geminiNonce) {
    throw new ApiError(
      403,
      'ANALYSIS_UPLOAD_UNVERIFIED',
      'The uploaded audio does not belong to this account.',
    );
  }

  if (!Number.isFinite(file.sizeBytes) || file.sizeBytes <= 0) {
    throw new ApiError(415, 'ANALYSIS_UPLOAD_INVALID', 'Upload a supported audio file.');
  }

  if (file.sizeBytes > MAX_AUDIO_BYTES || file.sizeBytes > reservation.declaredSize) {
    throw new ApiError(
      413,
      'ANALYSIS_UPLOAD_TOO_LARGE',
      'Audio files must be 50 MB or smaller.',
    );
  }
}

/**
 * Bounds the duration the browser reports.
 *
 * The server no longer holds the audio, so it cannot measure this itself. The
 * value is display metadata only — size, verified above against Gemini, is what
 * actually caps cost.
 */
export function readReportedDuration(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.min(value, MAX_AUDIO_DURATION_SECONDS);
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
