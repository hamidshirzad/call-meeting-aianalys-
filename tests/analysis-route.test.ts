import { describe, expect, it, vi } from 'vitest';
import {
  handleAnalysisRequest,
  type AnalysisHandlerDependencies,
} from '../api/analysis';
import { ApiError } from '../api/_lib/api-errors';
import type { ReservedUpload } from '../api/_lib/analysis-repository';

const reservation: ReservedUpload = {
  uid: 'verified-uid',
  id: '7f6e6f6b-38d5-4a24-9541-90aa8d91ff21',
  period: '2026-08',
  plan: 'free',
  limit: 5,
  geminiNonce: 'secret-nonce',
  declaredSize: 1_024,
  contentType: 'audio/mpeg',
};

const uploadedFile = {
  name: 'files/abc123',
  displayName: 'secret-nonce',
  sizeBytes: 1_024,
  mimeType: 'audio/mpeg',
};

function dependencies(): AnalysisHandlerDependencies {
  return {
    verifyIdToken: vi.fn().mockResolvedValue({ uid: 'verified-uid', email: 'owner@example.com' }),
    loadReservation: vi.fn().mockResolvedValue(reservation),
    getUploadedFile: vi.fn().mockResolvedValue(uploadedFile),
    deleteUploadedFile: vi.fn().mockResolvedValue(undefined),
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
  };
}

function request(body: Record<string, unknown>, token = 'valid') {
  return new Request('https://example.test/api/analysis', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validBody = {
  reservationId: reservation.id,
  fileName: 'files/abc123',
  originalName: 'call.mp3',
  durationSeconds: 120,
};

describe('POST /api/analysis', () => {
  it('authenticates before reading the reservation or touching the upload', async () => {
    const deps = dependencies();
    const response = await handleAnalysisRequest(
      new Request('https://example.test/api/analysis', { method: 'POST' }),
      deps,
    );
    expect(response.status).toBe(401);
    expect(deps.loadReservation).not.toHaveBeenCalled();
    expect(deps.getUploadedFile).not.toHaveBeenCalled();
  });

  it('rejects browser UID impersonation', async () => {
    const deps = dependencies();
    const response = await handleAnalysisRequest(
      request({ ...validBody, uid: 'attacker' }),
      deps,
    );
    expect(response.status).toBe(400);
    expect(deps.loadReservation).not.toHaveBeenCalled();
  });

  it('looks up the reservation under the verified UID, never one from the body', async () => {
    // This is what stops a client spending someone else's reservation: the
    // lookup is scoped to their own UID, so a stolen ID resolves to nothing.
    const deps = dependencies();
    await handleAnalysisRequest(request(validBody), deps);
    expect(deps.loadReservation).toHaveBeenCalledWith('verified-uid', reservation.id);
  });

  it('refuses a file whose nonce does not match, and deletes it', async () => {
    // Gemini file names are project-wide. Without the nonce check a client
    // could point this route at another user's audio.
    const deps = dependencies();
    vi.mocked(deps.getUploadedFile).mockResolvedValue({
      ...uploadedFile,
      displayName: 'someone-elses-nonce',
    });

    const response = await handleAnalysisRequest(request(validBody), deps);

    expect(response.status).toBe(403);
    expect(deps.analyze).not.toHaveBeenCalled();
    expect(deps.complete).not.toHaveBeenCalled();
    expect(deps.release).toHaveBeenCalledWith(reservation);
    expect(deps.deleteUploadedFile).toHaveBeenCalledWith('files/abc123');
  });

  it('rejects a file larger than the reservation authorized', async () => {
    const deps = dependencies();
    vi.mocked(deps.getUploadedFile).mockResolvedValue({ ...uploadedFile, sizeBytes: 999_999_999 });

    const response = await handleAnalysisRequest(request(validBody), deps);

    expect(response.status).toBe(413);
    expect(deps.analyze).not.toHaveBeenCalled();
    expect(deps.release).toHaveBeenCalledWith(reservation);
    expect(deps.deleteUploadedFile).toHaveBeenCalledTimes(1);
  });

  it('rejects a spent reservation without analyzing', async () => {
    const deps = dependencies();
    vi.mocked(deps.loadReservation).mockRejectedValue(
      new ApiError(404, 'ANALYSIS_RESERVATION_INVALID', 'This upload is no longer awaiting analysis.'),
    );

    const response = await handleAnalysisRequest(request(validBody), deps);

    expect(response.status).toBe(404);
    expect(deps.analyze).not.toHaveBeenCalled();
    expect(deps.complete).not.toHaveBeenCalled();
  });

  it('completes usage only after a report is saved, then removes the audio', async () => {
    const deps = dependencies();
    const response = await handleAnalysisRequest(request(validBody), deps);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      report: { summary: 'A useful call.', fileName: 'call.mp3', durationSeconds: 120 },
      usage: { completed: 1, remaining: 4 },
    });
    expect(deps.complete).toHaveBeenCalledTimes(1);
    expect(deps.release).not.toHaveBeenCalled();
    expect(deps.deleteUploadedFile).toHaveBeenCalledWith('files/abc123');
  });

  it('releases the reservation when Gemini processing fails', async () => {
    const deps = dependencies();
    vi.mocked(deps.analyze).mockRejectedValue(new Error('provider detail'));

    const response = await handleAnalysisRequest(request(validBody), deps);

    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('provider detail');
    expect(deps.complete).not.toHaveBeenCalled();
    expect(deps.release).toHaveBeenCalledWith(reservation);
    expect(deps.deleteUploadedFile).toHaveBeenCalledTimes(1);
  });

  it('bounds an implausible client-reported duration instead of storing it', async () => {
    const deps = dependencies();
    const response = await handleAnalysisRequest(
      request({ ...validBody, durationSeconds: 999_999 }),
      deps,
    );
    await expect(response.json()).resolves.toMatchObject({
      report: { durationSeconds: 3_600 },
    });
  });
});
