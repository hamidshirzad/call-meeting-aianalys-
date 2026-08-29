import { describe, expect, it, vi } from 'vitest';
import { handleUploadRequest, type UploadHandlerDependencies } from '../api/uploads';

function dependencies(): UploadHandlerDependencies {
  return {
    verifyIdToken: vi.fn().mockResolvedValue({ uid: 'verified-uid', email: 'owner@example.com' }),
    authorize: vi.fn().mockResolvedValue({
      storagePath: 'users/verified-uid/uploads/random-call.mp3',
      token: 'signed-upload-token',
      uploadEndpoint: 'https://project.storage.supabase.co/storage/v1/upload/resumable',
      bucket: 'call-uploads',
    }),
  };
}

function request(body: Record<string, unknown>) {
  return new Request('https://example.test/api/uploads', {
    method: 'POST',
    headers: { authorization: 'Bearer valid', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/uploads', () => {
  it('authenticates before signing', async () => {
    const deps = dependencies();
    const response = await handleUploadRequest(
      new Request('https://example.test/api/uploads', { method: 'POST' }), deps,
    );
    expect(response.status).toBe(401);
    expect(deps.authorize).not.toHaveBeenCalled();
  });

  it('rejects browser-selected identity and paths', async () => {
    const deps = dependencies();
    const response = await handleUploadRequest(request({
      fileName: 'call.mp3', contentType: 'audio/mpeg', size: 1_024, uid: 'attacker',
    }), deps);
    expect(response.status).toBe(400);
    expect(deps.authorize).not.toHaveBeenCalled();
  });

  it('returns a UID-scoped signed permission without a server secret', async () => {
    const deps = dependencies();
    const response = await handleUploadRequest(request({
      fileName: 'Discovery call.mp3', contentType: 'audio/mpeg', size: 1_024,
    }), deps);
    expect(response.status).toBe(200);
    const body = JSON.stringify(await response.json());
    expect(body).toContain('signed-upload-token');
    expect(body).not.toMatch(/SUPABASE_SECRET_KEY|sb_secret_/i);
    expect(deps.authorize).toHaveBeenCalledWith(
      expect.objectContaining({ uid: 'verified-uid' }), 'Discovery-call.mp3',
    );
  });

  it('rejects unsupported and oversized files before signing', async () => {
    const deps = dependencies();
    expect((await handleUploadRequest(request({
      fileName: 'notes.txt', contentType: 'text/plain', size: 100,
    }), deps)).status).toBe(415);
    expect((await handleUploadRequest(request({
      fileName: 'call.mp3', contentType: 'audio/mpeg', size: 50 * 1024 * 1024 + 1,
    }), deps)).status).toBe(413);
    expect(deps.authorize).not.toHaveBeenCalled();
  });
});
