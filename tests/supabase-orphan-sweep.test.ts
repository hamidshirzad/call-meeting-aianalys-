import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const bucket = vi.hoisted(() => ({
  list: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ storage: { from: () => bucket } }),
}));

vi.mock('../api/_lib/server-env.js', () => ({
  loadSupabaseStorageEnvironment: () => ({
    url: 'https://project.supabase.co',
    secretKey: 'sb_secret_test',
    bucket: 'call-uploads',
    resumableUploadUrl: 'https://project.storage.supabase.co/storage/v1/upload/resumable',
  }),
}));

const { ORPHANED_UPLOAD_AGE_MS, sweepOrphanedUploads } = await import('../api/_lib/supabase-storage');

const NOW = Date.parse('2026-08-29T20:00:00.000Z');

function objectAged(name: string, ageMs: number) {
  return { name, created_at: new Date(NOW - ageMs).toISOString() };
}

beforeEach(() => {
  bucket.list.mockReset();
  bucket.remove.mockReset().mockResolvedValue({ error: null });
});

afterEach(() => vi.restoreAllMocks());

describe('orphaned upload sweep', () => {
  it('removes only objects past the age limit', async () => {
    // An upload still being analysed must survive. The limit is deliberately
    // double the stale-reservation age so in-flight work is never destroyed.
    bucket.list.mockResolvedValue({
      data: [
        objectAged('abandoned.m4a', ORPHANED_UPLOAD_AGE_MS + 60_000),
        objectAged('in-flight.m4a', 60_000),
        objectAged('exactly-at-limit.m4a', ORPHANED_UPLOAD_AGE_MS),
      ],
      error: null,
    });

    await expect(sweepOrphanedUploads('verified-uid', NOW)).resolves.toBe(2);
    expect(bucket.remove).toHaveBeenCalledWith([
      'users/verified-uid/uploads/abandoned.m4a',
      'users/verified-uid/uploads/exactly-at-limit.m4a',
    ]);
  });

  it('lists only the verified account prefix', async () => {
    // The sweep runs with the service key, so scoping is the only thing
    // stopping it from enumerating every account's audio.
    bucket.list.mockResolvedValue({ data: [], error: null });

    await sweepOrphanedUploads('verified-uid', NOW);

    expect(bucket.list).toHaveBeenCalledWith(
      'users/verified-uid/uploads',
      expect.objectContaining({ limit: expect.any(Number) }),
    );
  });

  it('does nothing when there is nothing expired', async () => {
    bucket.list.mockResolvedValue({ data: [objectAged('fresh.m4a', 1_000)], error: null });

    await expect(sweepOrphanedUploads('verified-uid', NOW)).resolves.toBe(0);
    expect(bucket.remove).not.toHaveBeenCalled();
  });

  it('reports nothing swept when listing or removal fails', async () => {
    bucket.list.mockResolvedValue({ data: null, error: { message: 'unavailable' } });
    await expect(sweepOrphanedUploads('verified-uid', NOW)).resolves.toBe(0);

    bucket.list.mockResolvedValue({
      data: [objectAged('abandoned.m4a', ORPHANED_UPLOAD_AGE_MS + 1)],
      error: null,
    });
    bucket.remove.mockResolvedValue({ error: { message: 'denied' } });
    await expect(sweepOrphanedUploads('verified-uid', NOW)).resolves.toBe(0);
  });

  it('ignores objects with an unreadable timestamp', async () => {
    // Never delete something whose age cannot be established.
    bucket.list.mockResolvedValue({
      data: [{ name: 'no-timestamp.m4a' }, { name: 'bad.m4a', created_at: 'not a date' }],
      error: null,
    });

    await expect(sweepOrphanedUploads('verified-uid', NOW)).resolves.toBe(0);
    expect(bucket.remove).not.toHaveBeenCalled();
  });
});
