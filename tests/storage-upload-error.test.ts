import { describe, expect, it } from 'vitest';
import {
  describeStorageUploadFailure,
  stalledStorageUpload,
  STORAGE_UPLOAD_STALL_MS,
} from '../lib/storage-upload-error';

describe('Firebase Storage upload diagnostics', () => {
  it('gives an actionable message when the default bucket does not exist', () => {
    expect(describeStorageUploadFailure({ code: 'storage/bucket-not-found' })).toEqual({
      code: 'STORAGE_BUCKET_NOT_FOUND',
      message: expect.stringMatching(/default Storage bucket/i),
    });
  });

  it('distinguishes unpublished rules from network and quota failures', () => {
    expect(describeStorageUploadFailure({ code: 'storage/unauthorized' }).code)
      .toBe('STORAGE_UPLOAD_DENIED');
    expect(describeStorageUploadFailure({ code: 'storage/retry-limit-exceeded' }).code)
      .toBe('STORAGE_UPLOAD_NETWORK');
    expect(describeStorageUploadFailure({ code: 'storage/quota-exceeded' }).code)
      .toBe('STORAGE_QUOTA_EXCEEDED');
  });

  it('bounds uploads that never start', () => {
    expect(STORAGE_UPLOAD_STALL_MS).toBe(60_000);
    expect(stalledStorageUpload.code).toBe('STORAGE_UPLOAD_STALLED');
    expect(stalledStorageUpload.message).toMatch(/Cloud Storage is enabled/i);
  });
});
