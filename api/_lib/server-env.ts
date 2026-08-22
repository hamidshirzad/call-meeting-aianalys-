import { ServerConfigurationError } from './api-errors.js';

export interface FirebaseAdminEnvironment {
  projectId: string;
  clientEmail: string;
  privateKey: string;
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
