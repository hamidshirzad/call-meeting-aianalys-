export const STORAGE_UPLOAD_STALL_MS = 60_000;

export interface StorageUploadDiagnostic {
  code: string;
  message: string;
}

function firebaseStorageCode(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('code' in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

export function describeStorageUploadFailure(error: unknown): StorageUploadDiagnostic {
  switch (firebaseStorageCode(error)) {
    case 'storage/bucket-not-found':
      return {
        code: 'STORAGE_BUCKET_NOT_FOUND',
        message:
          'Cloud Storage is not ready for this Firebase project. Create its default Storage bucket, then publish storage.rules.',
      };
    case 'storage/unauthorized':
      return {
        code: 'STORAGE_UPLOAD_DENIED',
        message:
          'Firebase Storage denied the upload. Publish the storage.rules from PR #8 to the active bucket, then try again.',
      };
    case 'storage/quota-exceeded':
      return {
        code: 'STORAGE_QUOTA_EXCEEDED',
        message: 'Firebase Storage quota was exceeded. Check Firebase billing and Storage usage.',
      };
    case 'storage/retry-limit-exceeded':
      return {
        code: 'STORAGE_UPLOAD_NETWORK',
        message:
          'The upload could not reach Firebase Storage. Check the connection and confirm the default Storage bucket is enabled.',
      };
    case 'storage/canceled':
      return { code: 'STORAGE_UPLOAD_CANCELED', message: 'The audio upload was canceled.' };
    default:
      return {
        code: 'STORAGE_UPLOAD_FAILED',
        message:
          'Audio upload failed before analysis started. Check the Firebase Storage bucket and published rules, then try again.',
      };
  }
}

export const stalledStorageUpload: StorageUploadDiagnostic = {
  code: 'STORAGE_UPLOAD_STALLED',
  message:
    'The upload could not start. Confirm Cloud Storage is enabled for this Firebase project and publish storage.rules, then try again.',
};
