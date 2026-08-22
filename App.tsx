import type { User } from 'firebase/auth';
import { AuthProvider, useAuth, type AuthContextValue } from './auth/AuthProvider';
import AuthScreen from './components/AuthScreen';
import ProtectedDashboard from './components/ProtectedDashboard';

export interface AuthBoundaryState {
  status: AuthContextValue['status'];
  user: User | null;
}

export function shouldRenderDashboard({ status, user }: AuthBoundaryState): boolean {
  return status === 'authenticated' && user !== null;
}

function AuthBoundary() {
  const auth = useAuth();

  if (auth.status === 'loading') {
    return (
      <main className="app-shell centered-shell" aria-live="polite">
        <div className="loading-card">
          <div className="spinner" aria-hidden="true" />
          <h2>Checking your session</h2>
          <p className="muted">Firebase is verifying whether this browser has an authenticated user.</p>
        </div>
      </main>
    );
  }

  if (!shouldRenderDashboard(auth)) {
    return <AuthScreen auth={auth} />;
  }

  return <ProtectedDashboard user={auth.user as User} onLogout={auth.logout} />;
}

export default function App() {
  return (
    <AuthProvider>
      <AuthBoundary />
    </AuthProvider>
  );
}
