import { describe, expect, it, vi } from 'vitest';
import {
  handleUploadDiagnosticRequest,
  type UploadDiagnosticDependencies,
} from '../api/upload-diagnostics';

function dependencies(): UploadDiagnosticDependencies {
  return {
    verifyIdToken: vi.fn().mockResolvedValue({ uid: 'verified-uid' }),
    record: vi.fn(),
  };
}

describe('POST /api/upload-diagnostics', () => {
  it('authenticates and records only bounded non-sensitive details', async () => {
    const deps = dependencies();
    const response = await handleUploadDiagnosticRequest(new Request(
      'https://example.test/api/upload-diagnostics', {
        method: 'POST',
        headers: { authorization: 'Bearer valid', 'content-type': 'application/json' },
        body: JSON.stringify({ status: 403, category: 'http' }),
      },
    ), deps);
    expect(response.status).toBe(202);
    expect(deps.record).toHaveBeenCalledWith(expect.objectContaining({
      status: 403, category: 'http',
    }));
  });

  it('rejects arbitrary diagnostic payloads', async () => {
    const deps = dependencies();
    const response = await handleUploadDiagnosticRequest(new Request(
      'https://example.test/api/upload-diagnostics', {
        method: 'POST',
        headers: { authorization: 'Bearer valid', 'content-type': 'application/json' },
        body: JSON.stringify({ status: 999, category: 'token=secret' }),
      },
    ), deps);
    expect(response.status).toBe(400);
    expect(deps.record).not.toHaveBeenCalled();
  });
});
