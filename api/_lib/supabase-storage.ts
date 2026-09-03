import { writeFile } from 'node:fs/promises';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loadSupabaseStorageEnvironment } from './server-env.js';

export interface TemporaryUploadAuthorization {
  storagePath: string;
  token: string;
  uploadEndpoint: string;
  bucket: string;
}

export interface TemporaryUploadMetadata {
  size: number;
  contentType: string;
}

let cachedClient: SupabaseClient | null = null;

function client(): SupabaseClient {
  if (cachedClient) return cachedClient;
  const environment = loadSupabaseStorageEnvironment();
  cachedClient = createClient(environment.url, environment.secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
  return cachedClient;
}

function storage() {
  const environment = loadSupabaseStorageEnvironment();
  return {
    environment,
    bucket: client().storage.from(environment.bucket),
  };
}

export function safeTemporaryFileName(value: unknown): string {
  if (typeof value !== 'string') return 'call-audio';
  const normalized = value
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    // Collapse dot runs. assertOwnedUploadPath rejects any name containing
    // '..', so leaving one here would mint a path the server's own validator
    // refuses — the upload succeeds and analysis then 403s.
    .replace(/\.{2,}/g, '.')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(-100);
  return normalized || 'call-audio';
}

export function createTemporaryUploadPath(uid: string, fileName: string): string {
  return `users/${uid}/uploads/${crypto.randomUUID()}-${safeTemporaryFileName(fileName)}`;
}

export async function createTemporaryUploadAuthorization(
  uid: string,
  fileName: string,
): Promise<TemporaryUploadAuthorization> {
  const path = createTemporaryUploadPath(uid, fileName);
  const { environment, bucket } = storage();
  const { data, error } = await bucket.createSignedUploadUrl(path, { upsert: false });
  if (error || !data?.token) {
    throw new Error('Temporary upload authorization failed.');
  }
  return {
    storagePath: path,
    token: data.token,
    uploadEndpoint: environment.resumableUploadUrl,
    bucket: environment.bucket,
  };
}

export async function inspectTemporaryUpload(path: string): Promise<TemporaryUploadMetadata> {
  const { data, error } = await storage().bucket.info(path);
  if (error || !data) {
    throw new Error('Temporary upload metadata could not be read.');
  }
  return {
    size: Number(data.size),
    contentType: data.contentType ?? '',
  };
}

export async function downloadTemporaryUpload(path: string, destination: string): Promise<void> {
  const { data, error } = await storage().bucket.download(path);
  if (error || !data) {
    throw new Error('Temporary upload could not be downloaded.');
  }
  await writeFile(destination, Buffer.from(await data.arrayBuffer()));
}

export async function deleteTemporaryUpload(path: string): Promise<void> {
  const { error } = await storage().bucket.remove([path]);
  if (error) {
    throw new Error('Temporary upload could not be deleted.');
  }
}

/**
 * How long an uploaded object may sit before it is considered abandoned.
 *
 * Comfortably longer than any analysis and double the stale-reservation age in
 * analysis-repository, so an upload still being processed is never removed.
 */
export const ORPHANED_UPLOAD_AGE_MS = 30 * 60 * 1000;

const ORPHAN_SWEEP_PAGE_SIZE = 100;

/**
 * Deletes uploads that never reached analysis.
 *
 * Objects are removed in the analysis handler's finally block, but a request
 * that dies before it starts — an abandoned tab, a cancelled upload, a
 * platform timeout between signing and analysis — leaves an object with nothing
 * to clean it up. Stale reservations already self-heal in AnalysisRepository;
 * this is the storage half of that.
 *
 * Scoped to a single verified UID's prefix, so it can never enumerate or touch
 * another account's audio.
 */
export async function sweepOrphanedUploads(uid: string, now = Date.now()): Promise<number> {
  const prefix = `users/${uid}/uploads`;
  const { data, error } = await storage().bucket.list(prefix, {
    limit: ORPHAN_SWEEP_PAGE_SIZE,
    sortBy: { column: 'created_at', order: 'asc' },
  });
  if (error || !Array.isArray(data)) return 0;

  const expired = data
    .filter((object) => {
      const created = Date.parse(String(object?.created_at ?? ''));
      return Number.isFinite(created) && now - created >= ORPHANED_UPLOAD_AGE_MS;
    })
    .map((object) => `${prefix}/${object.name}`);
  if (expired.length === 0) return 0;

  const { error: removeError } = await storage().bucket.remove(expired);
  return removeError ? 0 : expired.length;
}
