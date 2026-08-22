import type { User } from 'firebase/auth';

interface ProtectedDashboardProps {
  user: User;
  onLogout: () => Promise<void>;
}

export default function ProtectedDashboard({ user, onLogout }: ProtectedDashboardProps) {
  return (
    <main className="app-shell">
      <div className="dashboard" data-testid="protected-dashboard">
        <header className="dashboard-header">
          <div>
            <div className="brand">
              <span className="brand-mark" aria-hidden="true">4D</span>
              FourDoorAI Call Coach
            </div>
            <p className="muted" style={{ margin: '12px 0 0' }}>
              Authenticated workspace
            </p>
          </div>
          <button className="secondary-button" type="button" onClick={() => void onLogout()}>
            Sign out
          </button>
        </header>

        <section className="dashboard-grid">
          <article className="dashboard-card feature-card">
            <p className="eyebrow">Analysis</p>
            <h2>Secure call analysis is being connected</h2>
            <p className="muted">
              Upload and recording actions are disabled until the protected server endpoint can
              verify your Firebase session, enforce usage, and call Gemini without exposing a key.
            </p>
            <div className="notice" role="status">
              No client-side AI request will be made in this milestone.
            </div>
          </article>

          <article className="dashboard-card">
            <p className="eyebrow">Billing</p>
            <h2>Setup pending</h2>
            <p className="muted">
              Authentication proves who you are—not whether you paid. Stripe-controlled
              entitlement arrives in the billing milestone.
            </p>
            <span className="status-pill">
              <span className="status-dot" aria-hidden="true" />
              No plan assigned
            </span>
          </article>

          <article className="dashboard-card">
            <p className="eyebrow">Signed in as</p>
            <p className="user-email">{user.email ?? 'Verified Firebase user'}</p>
            <p className="muted">
              Identity comes from Firebase Authentication. Browser storage cannot replace this
              session or grant paid access.
            </p>
          </article>

          <article className="dashboard-card feature-card">
            <p className="eyebrow">Security checkpoint</p>
            <h2>Milestone 1</h2>
            <ul className="trust-list">
              <li>Protected authenticated rendering</li>
              <li>Server secrets excluded from Vite</li>
              <li>Subscription state no longer trusted from localStorage</li>
            </ul>
          </article>
        </section>
      </div>
    </main>
  );
}
