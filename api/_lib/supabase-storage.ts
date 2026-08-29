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
    .replace(/^-+|-+$/g, '')
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
