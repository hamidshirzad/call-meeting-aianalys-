import { describe, expect, it, vi } from 'vitest';
import {
  handleAnalysisRequest,
  type AnalysisHandlerDependencies,
} from '../api/analysis';
import { ApiError } from '../api/_lib/api-errors';
import type { UsageReservation } from '../api/_lib/analysis-repository';

const reservation: UsageReservation = {
  uid: 'verified-uid',
  id: 'request-id',
  period: '2026-08',
  plan: 'free',
  limit: 5,
};

function dependencies(): AnalysisHandlerDependencies {
  return {
    verifyIdToken: vi.fn().mockResolvedValue({ uid: 'verified-uid', email: 'owner@example.com' }),
    inspectUpload: vi.fn().mockResolvedValue({ size: 1_024, contentType: 'audio/mpeg' }),
    downloadUpload: vi.fn().mockResolvedValue(undefined),
    deleteUpload: vi.fn().mockResolvedValue(undefined),
    readDuration: vi.fn().mockResolvedValue(120),
    reserve: vi.fn().mockResolvedValue(reservation),
    analyze: vi.fn().mockResolvedValue({
      diarizedTranscript: [{ speaker: 'Agent', text: 'Hello' }],
      sentimentData: [{ segmentIndex: 0, score: 0.5 }],
      coachingCard: { strengths: ['Clear'], opportunities: ['Ask more'] },
      summary: 'A useful call.',
    }),
    complete: vi.fn().mockResolvedValue(undefined),
    release: vi.fn().mockResolvedValue(undefined),
    usage: vi.fn().mockResolvedValue({
      period: '2026-08', plan: 'free', completed: 1, reserved: 0, limit: 5, remaining: 4,
    }),
    removeLocalFile: vi.fn().mockResolvedValue(undefined),
  };
}

function request(body: Record<string, unknown>, token = 'valid') {
  return new Request('https://example.test/api/analysis', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/analysis', () => {
  it('authenticates before reading or touching the upload', async () => {
    const deps = dependencies();
    const response = await handleAnalysisRequest(
      new Request('https://example.test/api/analysis', { method: 'POST' }),
      deps,
    );
    expect(response.status).toBe(401);
    expect(deps.inspectUpload).not.toHaveBeenCalled();
    expect(deps.reserve).not.toHaveBeenCalled();
  });

  it('rejects browser UID impersonation and cross-user upload paths', async () => {
    const deps = dependencies();
    const impersonation = await handleAnalysisRequest(request({
      storagePath: 'users/verified-uid/uploads/call.mp3', uid: 'attacker',
    }), deps);
    expect(impersonation.status).toBe(400);
    expect(deps.reserve).not.toHaveBeenCalled();

    const crossUser = await handleAnalysisRequest(request({
      storagePath: 'users/attacker/uploads/call.mp3',
    }), deps);
    expect(crossUser.status).toBe(403);
    expect(deps.inspectUpload).not.toHaveBeenCalled();
  });

  it('completes usage only after a report is saved and cleans up temporary audio', async () => {
    const deps = dependencies();
    const response = await handleAnalysisRequest(request({
      storagePath: 'users/verified-uid/uploads/call.mp3', originalName: 'call.mp3',
    }), deps);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      report: { summary: 'A useful call.', fileName: 'call.mp3', durationSeconds: 120 },
      usage: { completed: 1, remaining: 4 },
    });
    expect(deps.complete).toHaveBeenCalledTimes(1);
    expect(deps.release).not.toHaveBeenCalled();
    expect(deps.removeLocalFile).toHaveBeenCalledTimes(1);
    expect(deps.deleteUpload).toHaveBeenCalledWith(
      'users/verified-uid/uploads/call.mp3',
    );
  });

  it('releases a reservation when validation or Gemini processing fails', async () => {
    const deps = dependencies();
    vi.mocked(deps.analyze).mockRejectedValue(new Error('provider detail'));
    const response = await handleAnalysisRequest(request({
      storagePath: 'users/verified-uid/uploads/call.mp3',
    }), deps);
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('provider detail');
    expect(deps.complete).not.toHaveBeenCalled();
    expect(deps.release).toHaveBeenCalledWith(reservation);
    expect(deps.deleteUpload).toHaveBeenCalledTimes(1);
  });

  it('does not download audio after an atomic limit rejection', async () => {
    const deps = dependencies();
    vi.mocked(deps.reserve).mockRejectedValue(
      new ApiError(429, 'USAGE_LIMIT_REACHED', 'Free plan monthly analysis limit reached.'),
    );
    const response = await handleAnalysisRequest(request({
      storagePath: 'users/verified-uid/uploads/call.mp3',
    }), deps);
    expect(response.status).toBe(429);
    expect(deps.downloadUpload).not.toHaveBeenCalled();
    expect(deps.analyze).not.toHaveBeenCalled();
    expect(deps.deleteUpload).toHaveBeenCalledTimes(1);
  });
});
