import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage, type Storage } from 'firebase-admin/storage';
import { loadFirebaseAdminEnvironment } from './server-env.js';

const adminAppName = 'fourdoor-call-coach-server';

export interface FirebaseAdminServices {
  app: App;
  auth: Auth;
  firestore: Firestore;
  storage: Storage;
}

let cachedServices: FirebaseAdminServices | null = null;

export function getFirebaseAdminServices(): FirebaseAdminServices {
  if (cachedServices) {
    return cachedServices;
  }

  const environment = loadFirebaseAdminEnvironment();
  const existingApp = getApps().find((app) => app.name === adminAppName);
  const app =
    existingApp ??
    initializeApp(
      {
        credential: cert({
          projectId: environment.projectId,
          clientEmail: environment.clientEmail,
          privateKey: environment.privateKey,
        }),
        projectId: environment.projectId,
        storageBucket: environment.storageBucket,
      },
      adminAppName,
    );

  cachedServices = {
    app,
    auth: getAuth(app),
    firestore: getFirestore(app),
    storage: getStorage(app),
  };

  return cachedServices;
}
