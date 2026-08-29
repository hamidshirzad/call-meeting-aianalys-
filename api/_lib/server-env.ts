import { ServerConfigurationError } from './api-errors.js';

export interface FirebaseAdminEnvironment {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

export interface GeminiEnvironment {
  apiKey: string;
  model: string;
}

export interface SupabaseStorageEnvironment {
  url: string;
  secretKey: string;
  bucket: string;
  resumableUploadUrl: string;
}

const firebaseAdminNames = [
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
] as const;

function isMissingOrPlaceholder(value: string | undefined): boolean {
  if (!value?.trim()) {
    return true;
  }

  return /(?:replace[-_ ]with|placeholder|your[-_ ])/i.test(value);
}

export function loadFirebaseAdminEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): FirebaseAdminEnvironment {
  const missingNames = firebaseAdminNames.filter((name) =>
    isMissingOrPlaceholder(environment[name]),
  );

  if (missingNames.length > 0) {
    throw new ServerConfigurationError(missingNames);
  }

  const projectId = environment.FIREBASE_PROJECT_ID!.trim();
  const clientEmail = environment.FIREBASE_CLIENT_EMAIL!.trim();
  const privateKey = environment.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n').trim();

  if (!clientEmail.includes('@')) {
    throw new ServerConfigurationError(['FIREBASE_CLIENT_EMAIL']);
  }

  if (
    !privateKey.startsWith('-----BEGIN PRIVATE KEY-----') ||
    !privateKey.endsWith('-----END PRIVATE KEY-----')
  ) {
    throw new ServerConfigurationError(['FIREBASE_PRIVATE_KEY']);
  }

  return Object.freeze({ projectId, clientEmail, privateKey });
}

export function loadSupabaseStorageEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): SupabaseStorageEnvironment {
  const names = ['SUPABASE_URL', 'SUPABASE_SECRET_KEY'] as const;
  const missingNames = names.filter((name) => isMissingOrPlaceholder(environment[name]));
  if (missingNames.length > 0) {
    throw new ServerConfigurationError(missingNames);
  }

  let url: URL;
  try {
    url = new URL(environment.SUPABASE_URL!.trim());
  } catch {
    throw new ServerConfigurationError(['SUPABASE_URL']);
  }

  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.pathname !== '' && url.pathname !== '/') ||
    url.search ||
    url.hash
  ) {
    throw new ServerConfigurationError(['SUPABASE_URL']);
  }

  const bucket = environment.SUPABASE_STORAGE_BUCKET?.trim() || 'call-uploads';
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(bucket)) {
    throw new ServerConfigurationError(['SUPABASE_STORAGE_BUCKET']);
  }

  const projectReference = url.hostname.endsWith('.supabase.co')
    ? url.hostname.slice(0, -'.supabase.co'.length)
    : null;
  const resumableUploadUrl = projectReference
    ? `https://${projectReference}.storage.supabase.co/storage/v1/upload/resumable/sign`
    : `${url.origin}/storage/v1/upload/resumable/sign`;

  return Object.freeze({
    url: url.origin,
    secretKey: environment.SUPABASE_SECRET_KEY!.trim(),
    bucket,
    resumableUploadUrl,
  });
}

export function loadGeminiEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): GeminiEnvironment {
  if (isMissingOrPlaceholder(environment.GEMINI_API_KEY)) {
    throw new ServerConfigurationError(['GEMINI_API_KEY']);
  }

  const model = environment.GEMINI_MODEL?.trim() || 'gemini-3.7-flash';
  if (!/^gemini-[a-z0-9.-]+$/i.test(model)) {
    throw new ServerConfigurationError(['GEMINI_MODEL']);
  }

  return Object.freeze({ apiKey: environment.GEMINI_API_KEY!.trim(), model });
}
