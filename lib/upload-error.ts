export const STORAGE_UPLOAD_STALL_MS = 60_000;

export interface StorageUploadDiagnostic {
  code: string;
  message: string;
}

/**
 * Turns an upload failure into something the user can act on.
 *
 * Audio goes straight from the browser to Gemini, so failures here are network
 * or session problems rather than anything about our own API. HTTP status is the
 * only signal available — the upload URL is opaque and carries its own session.
 */
export function describeUploadFailure(status: number | null): StorageUploadDiagnostic {
  if (status === 403 || status === 401) {
    return {
      code: 'UPLOAD_SESSION_REJECTED',
      message: 'The upload session expired before the audio finished. Try the analysis again.',
    };
  }

  if (status === 404 || status === 410) {
    return {
      code: 'UPLOAD_SESSION_EXPIRED',
      message: 'The upload session is no longer valid. Try the analysis again.',
    };
  }

  if (status === 413) {
    return {
      code: 'UPLOAD_TOO_LARGE',
      message: 'Audio files must be 50 MB or smaller.',
    };
  }

  if (status !== null && status >= 500) {
    return {
      code: 'UPLOAD_PROVIDER_UNAVAILABLE',
      message: 'The upload service is temporarily unavailable. Try again in a moment.',
    };
  }

  // No status at all means the request never completed — offline, DNS, or a
  // dropped connection mid-transfer.
  return {
    code: 'UPLOAD_NETWORK_FAILED',
    message: 'The audio could not be uploaded. Check your connection and try again.',
  };
}

export const stalledUpload: StorageUploadDiagnostic = {
  code: 'UPLOAD_STALLED',
  message: 'The upload stopped making progress. Check your connection and try again.',
};

export const canceledUpload: StorageUploadDiagnostic = {
  code: 'UPLOAD_CANCELED',
  message: 'The audio upload was canceled.',
};
