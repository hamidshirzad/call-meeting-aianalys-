import { describe, expect, it, vi } from 'vitest';
import { handleAnalysisRequest, type AnalysisHandlerDependencies } from '../api/analysis';
import { ApiError } from '../api/_lib/api-errors';
import type { UsageReservation } from '../api/_lib/analysis-repository';

const reservation: UsageReservation = {
  uid: 'verified-uid', id: 'request-id', period: '2026-08', plan: 'free', limit: 5,
};

function dependencies(): AnalysisHandlerDependencies {
  return {
    verifyIdToken: vi.fn().mockResolvedValue({ uid: 'verified-uid', email: 'owner@example.com' }),
    inspectUpload: vi.fn().mockResolvedValue({ size: 1_024, contentType: 'audio/mpeg' }),
    downloadUpload: vi.fn().mockResolvedValue(undefined),
    deleteUpload: vi.fn().mockResolvedValue(undefined),
    readDuration: vi.fn().mockResolvedValue(120),
    reserve: vi.fn().mockResolvedValue(reservation),
    startAnalysis: vi.fn().mockResolvedValue({
      interactionId: 'interaction-123456', geminiFileName: 'files/audio-123456',
    }),
    createJob: vi.fn().mockResolvedValue(undefined),
    deleteGeminiFile: vi.fn().mockResolvedValue(undefined),
    release: vi.fn().mockResolvedValue(undefined),
    usage: vi.fn().mockResolvedValue({
      period: '2026-08', plan: 'free', completed: 1, reserved: 0, limit: 5, remaining: 4,
    }),
    removeLocalFile: vi.fn().mockResolvedValue(undefined),
  };
}

function request(body: Record<string, unknown>) {
  return new Request('https://example.test/api/analysis', {
    method: 'POST',
    headers: { authorization: 'Bearer valid', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/analysis', () => {
  it('authenticates before touching storage', async () => {
    const deps = dependencies();
    const response = await handleAnalysisRequest(
      new Request('https://example.test/api/analysis', { method: 'POST' }), deps,
    );
    expect(response.status).toBe(401);
    expect(deps.inspectUpload).not.toHaveBeenCalled();
  });

  it('rejects browser identity and cross-user paths', async () => {
    const deps = dependencies();
    expect((await handleAnalysisRequest(request({
      storagePath: 'users/verified-uid/uploads/call.mp3', uid: 'attacker',
    }), deps)).status).toBe(400);
    expect((await handleAnalysisRequest(request({
      storagePath: 'users/attacker/uploads/call.mp3',
    }), deps)).status).toBe(403);
    expect(deps.inspectUpload).not.toHaveBeenCalled();
  });

  it('hands a background job off without charging and deletes uploaded copies', async () => {
    const deps = dependencies();
    const response = await handleAnalysisRequest(request({
      storagePath: 'users/verified-uid/uploads/call.mp3', originalName: 'call.mp3',
    }), deps);
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      status: 'processing',
      usage: { reserved: 0 },
    });
    expect(deps.createJob).toHaveBeenCalledWith(expect.objectContaining({
      uid: 'verified-uid', status: 'processing', originalName: 'call.mp3',
    }));
    expect(deps.release).not.toHaveBeenCalled();
    expect(deps.removeLocalFile).toHaveBeenCalledOnce();
    expect(deps.deleteUpload).toHaveBeenCalledWith('users/verified-uid/uploads/call.mp3');
  });

  it('releases quota and deletes audio when AI processing fails', async () => {
    const deps = dependencies();
    vi.mocked(deps.startAnalysis).mockRejectedValue(new Error('provider detail'));
    const response = await handleAnalysisRequest(request({
      storagePath: 'users/verified-uid/uploads/call.mp3',
    }), deps);
    expect(response.status).toBe(502);
    const body = await response.text();
    expect(body).not.toContain('provider detail');
    expect(body).toContain('ANALYSIS_PROVIDER_FAILED');
    expect(deps.release).toHaveBeenCalledWith(reservation);
    expect(deps.deleteUpload).toHaveBeenCalledOnce();
  });

  it('cleans up the Gemini file when the job record cannot be saved', async () => {
    const deps = dependencies();
    vi.mocked(deps.createJob).mockRejectedValue(new Error('firestore unavailable'));
    const response = await handleAnalysisRequest(request({
      storagePath: 'users/verified-uid/uploads/call.mp3',
    }), deps);
    expect(response.status).toBe(500);
    expect(deps.release).toHaveBeenCalledWith(reservation);
    expect(deps.deleteGeminiFile).toHaveBeenCalledWith('files/audio-123456');
    expect(deps.deleteUpload).toHaveBeenCalledOnce();
  });

  it('returns a retryable safe response when Gemini rate-limits an upload', async () => {
    const deps = dependencies();
    vi.mocked(deps.startAnalysis).mockRejectedValue({
      name: 'ApiError', status: 429, message: 'private Google response',
    });
    const response = await handleAnalysisRequest(request({
      storagePath: 'users/verified-uid/uploads/call.mp3',
    }), deps);
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).toContain('ANALYSIS_PROVIDER_BUSY');
    expect(body).not.toContain('private Google response');
    expect(deps.release).toHaveBeenCalledWith(reservation);
    expect(deps.deleteUpload).toHaveBeenCalledOnce();
  });

  it('deletes the uploaded object after an atomic limit rejection', async () => {
    const deps = dependencies();
    vi.mocked(deps.reserve).mockRejectedValue(
      new ApiError(429, 'USAGE_LIMIT_REACHED', 'Free plan monthly analysis limit reached.'),
    );
    const response = await handleAnalysisRequest(request({
      storagePath: 'users/verified-uid/uploads/call.mp3',
    }), deps);
    expect(response.status).toBe(429);
    expect(deps.downloadUpload).not.toHaveBeenCalled();
    expect(deps.deleteUpload).toHaveBeenCalledOnce();
  });
});
