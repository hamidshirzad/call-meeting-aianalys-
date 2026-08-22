import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { firebaseAuth, firebaseConfigurationError } from '../lib/firebase';
import { getHumanAuthError } from './auth-errors';
import { prepareFirebaseContinueUrl } from './firebase-continue-url';

export type AuthStatus =
  | 'loading'
  | 'authenticated'
  | 'unauthenticated'
  | 'configuration-error';

export interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  error: string | null;
  clearError: () => void;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function requireAuth() {
  if (!firebaseAuth) {
    throw new Error(firebaseConfigurationError ?? 'Firebase Authentication is unavailable.');
  }

  return firebaseAuth;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(
    firebaseConfigurationError ? 'configuration-error' : 'loading',
  );
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(firebaseConfigurationError);

  useEffect(() => {
    if (!firebaseAuth) {
      return undefined;
    }

    return onAuthStateChanged(
      firebaseAuth,
      (nextUser) => {
        setUser(nextUser);
        setStatus(nextUser ? 'authenticated' : 'unauthenticated');
      },
      (authError) => {
        setUser(null);
        setStatus('unauthenticated');
        setError(getHumanAuthError(authError));
      },
    );
  }, []);

  const runAuthAction = useCallback(async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
    } catch (authError) {
      const message = getHumanAuthError(authError);
      setError(message);
      throw new Error(message);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      error,
      clearError: () => setError(null),
      login: async (email, password) => {
        await runAuthAction(async () => {
          const auth = await requireAuth();
          await signInWithEmailAndPassword(auth, email.trim(), password);
        });
      },
      register: async (email, password) => {
        await runAuthAction(async () => {
          const auth = await requireAuth();
          await createUserWithEmailAndPassword(auth, email.trim(), password);
        });
      },
      resetPassword: async (email) => {
        await runAuthAction(async () => {
          const auth = await requireAuth();
          await sendPasswordResetEmail(auth, email.trim());
        });
      },
      loginWithGoogle: async () => {
        await runAuthAction(async () => {
          const auth = await requireAuth();
          const provider = new GoogleAuthProvider();
          provider.setCustomParameters({ prompt: 'select_account' });
          prepareFirebaseContinueUrl();
          await signInWithPopup(auth, provider);
        });
      },
      logout: async () => {
        await runAuthAction(async () => {
          const auth = await requireAuth();
          await signOut(auth);
        });
      },
    }),
    [error, runAuthAction, status, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }

  return context;
}
