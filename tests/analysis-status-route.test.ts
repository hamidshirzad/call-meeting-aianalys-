import { describe, expect, it, vi } from 'vitest';
import {
  handleAnalysisStatusRequest,
  type AnalysisStatusDependencies,
} from '../api/analysis-status';
import type { AnalysisJob } from '../api/_lib/analysis-repository';

const job: AnalysisJob = {
  id: 'job-1234567890123456',
  uid: 'verified-uid',
  status: 'processing',
  interactionId: 'interaction-123',
  geminiFileName: 'files/audio-123',
  originalName: 'Meeting.m4a',
  durationSeconds: 42,
  reservation: {
    uid: 'verified-uid', id: 'job-1234567890123456', period: '2026-08', plan: 'pro', limit: 50,
  },
};

function dependencies(): AnalysisStatusDependencies {
  return {
    verifyIdToken: vi.fn().mockResolvedValue({ uid: 'verified-uid', email: 'owner@example.com' }),
    getJob: vi.fn().mockResolvedValue(job),
    getReport: vi.fn().mockResolvedValue(null),
    getResult: vi.fn().mockResolvedValue({ status: 'processing' }),
    complete: vi.fn().mockResolvedValue(undefined),
    release: vi.fn().mockResolvedValue(undefined),
    updateStatus: vi.fn().mockResolvedValue(undefined),
    deleteGeminiFile: vi.fn().mockResolvedValue(undefined),
    usage: vi.fn().mockResolvedValue({
      period: '2026-08', plan: 'pro', completed: 1, reserved: 1, limit: 50, remaining: 48,
    }),
  };
}

function request(jobId = job.id) {
  return new Request(`https://example.test/api/analysis-status?jobId=${jobId}`, {
    headers: { authorization: 'Bearer valid' },
  });
}

describe('GET /api/analysis-status', () => {
  it('returns quickly while Gemini continues in the background', async () => {
    const deps = dependencies();
    const response = await handleAnalysisStatusRequest(request(), deps);
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({ status: 'processing', jobId: job.id });
    expect(deps.complete).not.toHaveBeenCalled();
  });

  it('atomically saves a completed report, charges once, and deletes Gemini audio', async () => {
    const deps = dependencies();
    vi.mocked(deps.getResult).mockResolvedValue({
      status: 'completed',
      report: {
        diarizedTranscript: [{ speaker: 'Speaker 1', text: 'Hello' }],
        sentimentData: [],
        coachingCard: { strengths: ['Clear'], opportunities: ['Ask more'] },
        summary: 'A useful meeting.',
      },
    });
    const response = await handleAnalysisStatusRequest(request(), deps);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: 'completed', report: { id: job.id, fileName: 'Meeting.m4a' },
    });
    expect(deps.complete).toHaveBeenCalledOnce();
    expect(deps.updateStatus).toHaveBeenCalledWith(job.uid, job.id, 'completed');
    expect(deps.deleteGeminiFile).toHaveBeenCalledWith(job.geminiFileName);
    expect(deps.release).not.toHaveBeenCalled();
  });

  it('returns the completed report even when non-authoritative cleanup metadata fails', async () => {
    const deps = dependencies();
    vi.mocked(deps.getResult).mockResolvedValue({
      status: 'completed',
      report: {
        diarizedTranscript: [], sentimentData: [],
        coachingCard: { strengths: [], opportunities: [] }, summary: 'Complete.',
      },
    });
    vi.mocked(deps.updateStatus).mockRejectedValue(new Error('metadata write failed'));
    vi.mocked(deps.deleteGeminiFile).mockRejectedValue(new Error('cleanup failed'));
    const response = await handleAnalysisStatusRequest(request(), deps);
    expect(response.status).toBe(200);
    expect(deps.complete).toHaveBeenCalledOnce();
  });

  it('releases quota and cleans Gemini audio when the background job fails', async () => {
    const deps = dependencies();
    vi.mocked(deps.getResult).mockResolvedValue({ status: 'failed' });
    const response = await handleAnalysisStatusRequest(request(), deps);
    expect(response.status).toBe(502);
    expect(deps.release).toHaveBeenCalledWith(job.reservation);
    expect(deps.updateStatus).toHaveBeenCalledWith(job.uid, job.id, 'failed');
    expect(deps.deleteGeminiFile).toHaveBeenCalledWith(job.geminiFileName);
  });

  it('cannot read another user job', async () => {
    const deps = dependencies();
    vi.mocked(deps.getJob).mockResolvedValue({ ...job, uid: 'other-user' });
    const response = await handleAnalysisStatusRequest(request(), deps);
    expect(response.status).toBe(404);
    expect(deps.getResult).not.toHaveBeenCalled();
  });
});
