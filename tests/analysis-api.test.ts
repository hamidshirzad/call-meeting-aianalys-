import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from 'firebase/auth';
import {
  createUploadPath,
  deleteReport,
  fetchReports,
  validateClientAudioFile,
} from '../lib/analysis-api';

const user = {
  uid: 'verified-uid',
  getIdToken: vi.fn().mockResolvedValue('firebase-token'),
} as unknown as User;

afterEach(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.mocked(user.getIdToken).mockResolvedValue('firebase-token');
});

describe('analysis browser boundary', () => {
  it('validates audio locally and builds only a UID-scoped upload path', () => {
    const file = new File(['audio'], 'Discovery call.mp3', { type: 'audio/mpeg' });
    expect(validateClientAudioFile(file)).toBe('audio/mpeg');
    expect(createUploadPath('verified-uid', file.name)).toMatch(
      /^users\/verified-uid\/uploads\/[a-f0-9-]+-Discovery-call\.mp3$/,
    );
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
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchReports(user);
    await deleteReport(user, '7f6e6f6b-38d5-4a24-9541-90aa8d91ff21');

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/reports', expect.objectContaining({
      method: 'GET',
      headers: expect.objectContaining({ authorization: 'Bearer firebase-token' }),
    }));
    const deleteOptions = fetchMock.mock.calls[1][1] as RequestInit;
    expect(deleteOptions.method).toBe('DELETE');
    expect(deleteOptions.body).toBe(JSON.stringify({
      reportId: '7f6e6f6b-38d5-4a24-9541-90aa8d91ff21',
    }));
    expect(deleteOptions.body).not.toContain('verified-uid');
  });
});
