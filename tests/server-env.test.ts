import { describe, expect, it } from 'vitest';
import { ServerConfigurationError } from '../api/_lib/api-errors';
import {
  loadFirebaseAdminEnvironment,
  loadSupabaseStorageEnvironment,
} from '../api/_lib/server-env';

const privateKey = [
  '-----BEGIN PRIVATE KEY-----',
  'test-key-material',
  '-----END PRIVATE KEY-----',
].join('\n');

describe('server-only Firebase Admin environment', () => {
  it('fails closed and names missing variables without exposing values', () => {
    expect(() => loadFirebaseAdminEnvironment({})).toThrowError(ServerConfigurationError);

    try {
      loadFirebaseAdminEnvironment({});
    } catch (error) {
      expect(error).toMatchObject({
        missingNames: [
          'FIREBASE_PROJECT_ID',
          'FIREBASE_CLIENT_EMAIL',
          'FIREBASE_PRIVATE_KEY',
        ],
      });
    }
  });

  it('rejects documented placeholder values', () => {
    expect(() =>
      loadFirebaseAdminEnvironment({
        FIREBASE_PROJECT_ID: 'server-only-placeholder',
        FIREBASE_CLIENT_EMAIL: 'server@example.com',
        FIREBASE_PRIVATE_KEY: privateKey,
      }),
    ).toThrowError(ServerConfigurationError);
  });

  it('normalizes escaped private-key newlines', () => {
    const environment = loadFirebaseAdminEnvironment({
      FIREBASE_PROJECT_ID: 'fourdoor-test',
      FIREBASE_CLIENT_EMAIL: 'server@fourdoor-test.iam.gserviceaccount.com',
      FIREBASE_PRIVATE_KEY: privateKey.replace(/\n/g, '\\n'),
    });

    expect(environment.privateKey).toBe(privateKey);
    expect(environment.projectId).toBe('fourdoor-test');
  });

  it('rejects malformed service-account fields', () => {
    expect(() =>
      loadFirebaseAdminEnvironment({
        FIREBASE_PROJECT_ID: 'fourdoor-test',
        FIREBASE_CLIENT_EMAIL: 'not-an-email',
        FIREBASE_PRIVATE_KEY: privateKey,
      }),
    ).toThrowError(ServerConfigurationError);

    expect(() =>
      loadFirebaseAdminEnvironment({
        FIREBASE_PROJECT_ID: 'fourdoor-test',
        FIREBASE_CLIENT_EMAIL: 'server@example.com',
        FIREBASE_PRIVATE_KEY: 'not-a-private-key',
      }),
    ).toThrowError(ServerConfigurationError);
  });
});

describe('server-only Supabase Storage environment', () => {
  it('fails closed when the project URL or secret key is missing', () => {
    expect(() => loadSupabaseStorageEnvironment({})).toThrowError(ServerConfigurationError);
    try {
      loadSupabaseStorageEnvironment({});
    } catch (error) {
      expect(error).toMatchObject({ missingNames: ['SUPABASE_URL', 'SUPABASE_SECRET_KEY'] });
    }
  });

  it('normalizes the URL and derives the resumable endpoint', () => {
    expect(loadSupabaseStorageEnvironment({
      SUPABASE_URL: 'https://project-ref.supabase.co/',
      SUPABASE_SECRET_KEY: 'sb_secret_test-only-value',
    })).toMatchObject({
      url: 'https://project-ref.supabase.co',
      bucket: 'call-uploads',
      resumableUploadUrl: 'https://project-ref.storage.supabase.co/storage/v1/upload/resumable/sign',
    });
  });

  it('rejects URLs with paths and malformed bucket names', () => {
    expect(() => loadSupabaseStorageEnvironment({
      SUPABASE_URL: 'https://project-ref.supabase.co/not-allowed',
      SUPABASE_SECRET_KEY: 'sb_secret_test-only-value',
    })).toThrowError(ServerConfigurationError);
    expect(() => loadSupabaseStorageEnvironment({
      SUPABASE_URL: 'https://project-ref.supabase.co',
      SUPABASE_SECRET_KEY: 'sb_secret_test-only-value',
      SUPABASE_STORAGE_BUCKET: '../other-bucket',
    })).toThrowError(ServerConfigurationError);
  });
});
