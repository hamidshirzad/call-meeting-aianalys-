import { describe, expect, it, vi } from 'vitest';
import {
  handleUploadUrlRequest,
  type UploadUrlHandlerDependencies,
} from '../api/analysis-upload-url';
import { ApiError } from '../api/_lib/api-errors';
import type { ReservedUpload } from '../api/_lib/analysis-repository';

function dependencies(): UploadUrlHandlerDependencies {
  return {
    verifyIdToken: vi.fn().mockResolvedValue({ uid: 'verified-uid', email: 'owner@example.com' }),
    reserve: vi.fn().mockImplementation(async (_principal, reservationId, upload) => ({
      uid: 'verified-uid',
      id: reservationId,
      period: '2026-08',
      plan: 'free' as const,
      limit: 5,
      ...upload,
    } satisfies ReservedUpload)),
    startUpload: vi.fn().mockResolvedValue('https://upload.example.test/session/abc'),
    release: vi.fn().mockResolvedValue(undefined),
  };
}

function request(body: Record<string, unknown>, token = 'valid') {
  return new Request('https://example.test/api/analysis/upload-url', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validBody = { size: 1_024, contentType: 'audio/mpeg' };

describe('POST /api/analysis/upload-url', () => {
  it('authenticates before reserving quota or minting a URL', async () => {
    const deps = dependencies();
    const response = await handleUploadUrlRequest(
      new Request('https://example.test/api/analysis/upload-url', { method: 'POST' }),
      deps,
    );
    expect(response.status).toBe(401);
    expect(deps.reserve).not.toHaveBeenCalled();
    expect(deps.startUpload).not.toHaveBeenCalled();
  });

  it('rejects browser UID and plan impersonation', async () => {
    const deps = dependencies();
    expect((await handleUploadUrlRequest(request({ ...validBody, uid: 'attacker' }), deps)).status)
      .toBe(400);
    expect((await handleUploadUrlRequest(request({ ...validBody, plan: 'pro' }), deps)).status)
      .toBe(400);
    expect(deps.reserve).not.toHaveBeenCalled();
  });

  it('refuses unsupported types and oversize files before reserving quota', async () => {
    // Reserving first would burn a monthly slot on a file we already know we
    // will not accept.
    const deps = dependencies();
    expect((await handleUploadUrlRequest(request({ size: 1_024, contentType: 'text/plain' }), deps)).status)
      .toBe(415);
    expect((await handleUploadUrlRequest(request({ size: 51 * 1024 * 1024, contentType: 'audio/mpeg' }), deps)).status)
      .toBe(413);
    expect(deps.reserve).not.toHaveBeenCalled();
  });

  it('never returns the ownership nonce to the browser', async () => {
    // The nonce only proves ownership because the client cannot learn it.
    const deps = dependencies();
    const response = await handleUploadUrlRequest(request(validBody), deps);
    const body = await response.text();

    const [, , upload] = vi.mocked(deps.reserve).mock.calls[0];
    expect(upload.geminiNonce).toBeTruthy();
    expect(body).not.toContain(upload.geminiNonce);
    expect(JSON.parse(body)).toEqual({
      uploadUrl: 'https://upload.example.test/session/abc',
      reservationId: expect.any(String),
    });
  });

  it('records the nonce and normalized type on the reservation', async () => {
    const deps = dependencies();
    await handleUploadUrlRequest(request({ size: 2_048, contentType: 'audio/x-wav' }), deps);

    const [, , upload] = vi.mocked(deps.reserve).mock.calls[0];
    expect(upload).toMatchObject({ declaredSize: 2_048, contentType: 'audio/wav' });
    expect(deps.startUpload).toHaveBeenCalledWith('audio/wav', 2_048, upload.geminiNonce);
  });

  it('does not mint a URL once the monthly limit is reached', async () => {
    const deps = dependencies();
    vi.mocked(deps.reserve).mockRejectedValue(
      new ApiError(429, 'USAGE_LIMIT_REACHED', 'Free plan monthly analysis limit reached.'),
    );

    const response = await handleUploadUrlRequest(request(validBody), deps);

    expect(response.status).toBe(429);
    expect(deps.startUpload).not.toHaveBeenCalled();
  });

  it('releases the reservation when Gemini refuses the upload session', async () => {
    // Otherwise a provider outage would silently consume the user's quota.
    const deps = dependencies();
    vi.mocked(deps.startUpload).mockRejectedValue(new Error('provider detail'));

    const response = await handleUploadUrlRequest(request(validBody), deps);

    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('provider detail');
    expect(deps.release).toHaveBeenCalledTimes(1);
  });
});
