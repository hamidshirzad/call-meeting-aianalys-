import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from 'firebase/auth';
import {
  AnalysisApiError,
  deleteReport,
  describeAnalysisError,
  fetchReports,
  validateClientAudioFile,
} from '../lib/analysis-api';

const user = {
  uid: 'verified-uid',
  getIdToken: vi.fn().mockResolvedValue('firebase-token'),
} as unknown as User;

beforeEach(() => vi.mocked(user.getIdToken).mockResolvedValue('firebase-token'));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('analysis browser boundary', () => {
  it('turns missing storage configuration into a safe message', () => {
    const message = describeAnalysisError(
      new AnalysisApiError('The required server integration is not configured.', 'SERVER_NOT_CONFIGURED'),
    );
    expect(message).toMatch(/secure storage is being connected/i);
    expect(message).toMatch(/audio was not retained/i);
    expect(message).not.toMatch(/SUPABASE|SECRET_KEY|server integration/i);
  });

  it('validates supported audio locally', () => {
    expect(validateClientAudioFile(
      new File(['audio'], 'Discovery call.mp3', { type: 'audio/mpeg' }),
    )).toBe('audio/mpeg');
    expect(() => validateClientAudioFile(new File(['x'], 'notes.txt', { type: 'text/plain' })))
      .toThrow(/supported audio/i);
  });

  it('authenticates report reads and deletes without sending a UID', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        reports: [],
        usage: { period: '2026-08', plan: 'free', completed: 0, reserved: 0, limit: 5, remaining: 5 },
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ deleted: true }), {
        status: 200, headers: { 'content-type': 'application/json' },
      }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchReports(user);
    await deleteReport(user, '7f6e6f6b-38d5-4a24-9541-90aa8d91ff21');

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/reports', expect.objectContaining({
      method: 'GET',
      headers: expect.objectContaining({ authorization: 'Bearer firebase-token' }),
    }));
    const deleteOptions = fetchMock.mock.calls[1][1] as RequestInit;
    expect(deleteOptions.body).not.toContain('verified-uid');
  });
});
