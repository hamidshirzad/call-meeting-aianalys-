import { describe, expect, it } from 'vitest';
import {
  canceledUpload,
  describeUploadFailure,
  stalledUpload,
  STORAGE_UPLOAD_STALL_MS,
} from '../lib/upload-error';

describe('direct upload diagnostics', () => {
  it('separates an expired upload session from a transport failure', () => {
    // These need different advice: a dead session is fixed by retrying the
    // analysis, a network failure by checking the connection.
    expect(describeUploadFailure(403).code).toBe('UPLOAD_SESSION_REJECTED');
    expect(describeUploadFailure(404).code).toBe('UPLOAD_SESSION_EXPIRED');
    expect(describeUploadFailure(410).code).toBe('UPLOAD_SESSION_EXPIRED');
    expect(describeUploadFailure(null).code).toBe('UPLOAD_NETWORK_FAILED');
  });

  it('reports provider outages and oversize rejections distinctly', () => {
    expect(describeUploadFailure(500).code).toBe('UPLOAD_PROVIDER_UNAVAILABLE');
    expect(describeUploadFailure(503).code).toBe('UPLOAD_PROVIDER_UNAVAILABLE');
    expect(describeUploadFailure(413)).toEqual({
      code: 'UPLOAD_TOO_LARGE',
      message: expect.stringMatching(/50 MB/i),
    });
  });

  it('never leaks storage-provider wording to the user', () => {
    // The bucket is gone; telling users to publish storage rules would be
    // advice they cannot act on.
    const messages = [403, 404, 413, 500, null]
      .map((status) => describeUploadFailure(status).message)
      .concat(stalledUpload.message, canceledUpload.message);

    for (const message of messages) {
      expect(message).not.toMatch(/firebase|storage\.rules|bucket/i);
    }
  });

  it('bounds uploads that stop making progress', () => {
    expect(STORAGE_UPLOAD_STALL_MS).toBe(60_000);
    expect(stalledUpload.code).toBe('UPLOAD_STALLED');
    expect(canceledUpload.code).toBe('UPLOAD_CANCELED');
  });
});
