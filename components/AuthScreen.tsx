import { useState, type FormEvent } from 'react';
import type { AuthContextValue } from '../auth/AuthProvider';

type AuthMode = 'login' | 'register' | 'reset';

interface AuthScreenProps {
  auth: AuthContextValue;
}

const copy: Record<AuthMode, { title: string; description: string; submit: string }> = {
  login: {
    title: 'Welcome back',
    description: 'Sign in to continue to your private coaching workspace.',
    submit: 'Sign in',
  },
  register: {
    title: 'Create your account',
    description: 'Start free with five private call analyses every month.',
    submit: 'Create account',
  },
  reset: {
    title: 'Reset your password',
    description: 'We will send a password-reset link if this email belongs to an account.',
    submit: 'Send reset link',
  },
};

export default function AuthScreen({ auth }: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const changeMode = (nextMode: AuthMode) => {
    auth.clearError();
    setSuccess(null);
    setMode(nextMode);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setSuccess(null);

    try {
      if (mode === 'register') {
        await auth.register(email, password);
      } else if (mode === 'reset') {
        await auth.resetPassword(email);
        setSuccess('Check your inbox for a password-reset link.');
      } else {
        await auth.login(email, password);
      }
    } catch {
      // AuthProvider owns the human-readable error state.
    } finally {
      setBusy(false);
    }
  };

  const googleLogin = async () => {
    setBusy(true);
    setSuccess(null);
    try {
      await auth.loginWithGoogle();
    } catch {
      // AuthProvider owns the human-readable error state.
    } finally {
      setBusy(false);
    }
  };

  const configurationBlocked = auth.status === 'configuration-error';

  return (
    <main className="app-shell centered-shell">
      <section className="auth-layout" aria-label="Account access">
        <div className="auth-story">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">4D</span>
            FourDoorAI Call Coach
          </div>
          <div>
            <p className="eyebrow">Private call coaching</p>
            <h1>Turn every call into your next advantage.</h1>
            <p>
              Upload a recorded sales call and receive a clear summary, coaching opportunities,
              strengths, and a speaker-by-speaker transcript.
            </p>
            <ul className="trust-list">
              <li>Five call analyses included on the Free plan</li>
              <li>Fifty monthly analyses with Pro</li>
              <li>Temporary audio is removed after analysis</li>
            </ul>
          </div>
        </div>

        <div className="auth-panel">
          <p className="eyebrow">Account</p>
          <h2>{copy[mode].title}</h2>
          <p className="muted">{copy[mode].description}</p>

          {auth.error && <div className="error-notice" role="alert">{auth.error}</div>}
          {success && <div className="success-notice" role="status">{success}</div>}

          <form className="auth-form" onSubmit={submit}>
            <div className="field">
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={configurationBlocked || busy}
              />
            </div>

            {mode !== 'reset' && (
              <div className="field">
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  minLength={6}
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={configurationBlocked || busy}
                />
              </div>
            )}

            <button className="primary-button" type="submit" disabled={configurationBlocked || busy}>
              {busy ? 'Please wait…' : copy[mode].submit}
            </button>

            {mode !== 'reset' && (
              <button
                className="secondary-button"
                type="button"
                disabled={configurationBlocked || busy}
                onClick={googleLogin}
              >
                Continue with Google
              </button>
            )}
          </form>

          <div className="auth-actions">
            {mode === 'login' ? (
              <>
                <button className="text-button" type="button" onClick={() => changeMode('register')}>
                  Create account
                </button>
                <button className="text-button" type="button" onClick={() => changeMode('reset')}>
                  Forgot password?
                </button>
              </>
            ) : (
              <button className="text-button" type="button" onClick={() => changeMode('login')}>
                Back to sign in
              </button>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
