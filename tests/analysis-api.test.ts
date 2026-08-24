import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from 'firebase/auth';
import {
  analyzeAudio,
  deleteReport,
  fetchReports,
  putAudioToUploadUrl,
  validateClientAudioFile,
} from '../lib/analysis-api';

const user = {
  uid: 'verified-uid',
  getIdToken: vi.fn().mockResolvedValue('firebase-token'),
} as unknown as User;

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * Minimal XMLHttpRequest stand-in. jsdom's implementation cannot be driven
 * through a real upload, and progress reporting is the behaviour under test.
 */
class FakeXhr {
  static instances: FakeXhr[] = [];
  upload = { onprogress: null as ((event: ProgressEvent) => void) | null };
  headers: Record<string, string> = {};
  method = '';
  url = '';
  status = 200;
  responseText = JSON.stringify({ file: { name: 'files/abc123' } });
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;
  aborted = false;
  sentBody: unknown = null;

  constructor() {
    FakeXhr.instances.push(this);
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(key: string, value: string) {
    this.headers[key] = value;
  }

  send(body: unknown) {
    this.sentBody = body;
  }

  abort() {
    this.aborted = true;
    this.onabort?.();
  }

  emitProgress(loaded: number, total: number) {
    this.upload.onprogress?.({ loaded, total, lengthComputable: true } as ProgressEvent);
  }
}

beforeEach(() => {
  FakeXhr.instances = [];
  vi.mocked(user.getIdToken).mockResolvedValue('firebase-token');
  vi.stubGlobal('XMLHttpRequest', FakeXhr as unknown as typeof XMLHttpRequest);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('analysis browser boundary', () => {
  it('validates audio locally before any network call', () => {
    const file = new File(['audio'], 'Discovery call.mp3', { type: 'audio/mpeg' });
    expect(validateClientAudioFile(file)).toBe('audio/mpeg');
    expect(() => validateClientAudioFile(new File(['x'], 'notes.txt', { type: 'text/plain' })))
      .toThrow(/supported audio/i);
  });

  it('sends audio to the minted URL without attaching credentials', async () => {
    // The upload URL carries its own session. Sending our Firebase token to a
    // third-party host would leak it; sending an API key is impossible here by
    // design, which is the point of minting server-side.
    const file = new File(['audio'], 'call.mp3', { type: 'audio/mpeg' });
    const promise = putAudioToUploadUrl('https://upload.example.test/s/1', file, 'audio/mpeg');

    const xhr = FakeXhr.instances[0];
    xhr.onload?.();

    await expect(promise).resolves.toBe('files/abc123');
    expect(xhr.method).toBe('PUT');
    expect(xhr.headers).toMatchObject({
      'X-Goog-Upload-Command': 'upload, finalize',
      'X-Goog-Upload-Offset': '0',
      'Content-Type': 'audio/mpeg',
    });
    expect(Object.keys(xhr.headers).join(' ').toLowerCase()).not.toContain('authorization');
    expect(xhr.sentBody).toBe(file);
  });

  it('reports intermediate upload progress, not just completion', async () => {
    const seen: number[] = [];
    const file = new File(['audio'], 'call.mp3', { type: 'audio/mpeg' });
    const promise = putAudioToUploadUrl(
      'https://upload.example.test/s/1',
      file,
      'audio/mpeg',
      (percentage) => seen.push(percentage),
    );

    const xhr = FakeXhr.instances[0];
    xhr.emitProgress(25, 100);
    xhr.emitProgress(50, 100);
    xhr.onload?.();
    await promise;

    expect(seen).toEqual([25, 50, 100]);
  });

  it('surfaces an expired upload session distinctly from a network failure', async () => {
    const file = new File(['audio'], 'call.mp3', { type: 'audio/mpeg' });

    const expired = putAudioToUploadUrl('https://upload.example.test/s/1', file, 'audio/mpeg');
    FakeXhr.instances[0].status = 404;
    FakeXhr.instances[0].onload?.();
    await expect(expired).rejects.toMatchObject({ code: 'UPLOAD_SESSION_EXPIRED' });

    const offline = putAudioToUploadUrl('https://upload.example.test/s/1', file, 'audio/mpeg');
    FakeXhr.instances[1].onerror?.();
    await expect(offline).rejects.toMatchObject({ code: 'UPLOAD_NETWORK_FAILED' });
  });

  it('fails clearly when the upload succeeds but returns no file name', async () => {
    const file = new File(['audio'], 'call.mp3', { type: 'audio/mpeg' });
    const promise = putAudioToUploadUrl('https://upload.example.test/s/1', file, 'audio/mpeg');

    FakeXhr.instances[0].responseText = '{"file":{}}';
    FakeXhr.instances[0].onload?.();

    await expect(promise).rejects.toMatchObject({ code: 'UPLOAD_NETWORK_FAILED' });
  });

  it('aborts a stalled upload and reports it as stalled, not canceled', async () => {
    // The abort fires its own handler, so ordering decides which message the
    // user sees. "Canceled" would wrongly imply they stopped it themselves.
    vi.useFakeTimers();
    try {
      const file = new File(['audio'], 'call.mp3', { type: 'audio/mpeg' });
      const promise = putAudioToUploadUrl('https://upload.example.test/s/1', file, 'audio/mpeg');
      // Attach the expectation before advancing, or the rejection lands with no
      // handler and surfaces as an unhandled rejection.
      const rejects = expect(promise).rejects.toMatchObject({ code: 'UPLOAD_STALLED' });

      await vi.advanceTimersByTimeAsync(60_000);

      await rejects;
      expect(FakeXhr.instances[0].aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reserves an upload, sends the bytes, then asks the server to analyze', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        uploadUrl: 'https://upload.example.test/s/1',
        reservationId: 'reservation-1',
      }))
      .mockResolvedValueOnce(jsonResponse({ report: { id: 'r1' }, usage: { remaining: 4 } }));
    vi.stubGlobal('fetch', fetchMock);

    const file = new File(['audio'], 'call.mp3', { type: 'audio/mpeg' });
    const promise = analyzeAudio(user, file);

    await vi.waitFor(() => expect(FakeXhr.instances).toHaveLength(1));
    FakeXhr.instances[0].onload?.();
    await expect(promise).resolves.toMatchObject({ report: { id: 'r1' } });

    const [mintPath, mintOptions] = fetchMock.mock.calls[0];
    expect(mintPath).toBe('/api/analysis-upload-url');
    expect(JSON.parse(mintOptions.body)).toEqual({ size: file.size, contentType: 'audio/mpeg' });

    const [analyzePath, analyzeOptions] = fetchMock.mock.calls[1];
    expect(analyzePath).toBe('/api/analysis');
    const analyzeBody = JSON.parse(analyzeOptions.body);
    expect(analyzeBody).toMatchObject({
      reservationId: 'reservation-1',
      fileName: 'files/abc123',
      originalName: 'call.mp3',
    });
    // Identity comes from the verified token, never from the browser.
    expect(analyzeOptions.body).not.toContain('verified-uid');
  });

  it('still analyzes when the browser cannot read the audio duration', async () => {
    // Duration is display metadata. A codec the browser cannot decode is still
    // one Gemini may handle, so this must never block the analysis.
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        uploadUrl: 'https://upload.example.test/s/1',
        reservationId: 'reservation-1',
      }))
      .mockResolvedValueOnce(jsonResponse({ report: { id: 'r1' }, usage: { remaining: 4 } }));
    vi.stubGlobal('fetch', fetchMock);

    const file = new File(['audio'], 'call.mp3', { type: 'audio/mpeg' });
    const promise = analyzeAudio(user, file);

    await vi.waitFor(() => expect(FakeXhr.instances).toHaveLength(1));
    FakeXhr.instances[0].onload?.();
    await expect(promise).resolves.toMatchObject({ report: { id: 'r1' } });

    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      durationSeconds: null,
    });
  });

  it('reports the preparing phase before any bytes move', async () => {
    // The mint round-trip happens before the upload starts. Without this phase
    // the user sits on a silent 0% and cannot tell the request is progressing.
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        uploadUrl: 'https://upload.example.test/s/1',
        reservationId: 'reservation-1',
      }))
      .mockResolvedValueOnce(jsonResponse({ report: { id: 'r1' }, usage: { remaining: 4 } }));
    vi.stubGlobal('fetch', fetchMock);

    const phases: string[] = [];
    const file = new File(['audio'], 'call.mp3', { type: 'audio/mpeg' });
    const promise = analyzeAudio(user, file, undefined, (phase) => phases.push(phase));

    await vi.waitFor(() => expect(FakeXhr.instances).toHaveLength(1));
    // Preparing must already have fired by the time the upload is created.
    expect(phases).toEqual(['preparing', 'uploading']);

    FakeXhr.instances[0].onload?.();
    await promise;

    expect(phases).toEqual(['preparing', 'uploading', 'analyzing']);
  });

  it('never uploads when the server refuses to authorize the upload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: { code: 'USAGE_LIMIT_REACHED', message: 'Limit reached.' } }),
      { status: 429, headers: { 'content-type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchMock);

    const file = new File(['audio'], 'call.mp3', { type: 'audio/mpeg' });

    await expect(analyzeAudio(user, file)).rejects.toMatchObject({ code: 'USAGE_LIMIT_REACHED' });
    expect(FakeXhr.instances).toHaveLength(0);
  });

  it('authenticates report reads and deletes without sending a UID', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        reports: [],
        usage: { period: '2026-08', plan: 'free', completed: 0, reserved: 0, limit: 5, remaining: 5 },
      }))
      .mockResolvedValueOnce(jsonResponse({ deleted: true }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchReports(user);
    await deleteReport(user, '7f6e6f6b-38d5-4a24-9541-90aa8d91ff21');

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/reports', expect.objectContaining({
      method: 'GET',
      headers: expect.objectContaining({ authorization: 'Bearer firebase-token' }),
    }));
    const deleteOptions = fetchMock.mock.calls[1][1] as RequestInit;
    expect(deleteOptions.method).toBe('DELETE');
    expect(deleteOptions.body).not.toContain('verified-uid');
  });
});
