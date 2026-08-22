import { useCallback, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  createCheckout,
  createPortal,
  fetchAccount,
  type AccountProfile,
} from '../lib/billing-api';

interface ProtectedDashboardProps {
  user: User;
  onLogout: () => Promise<void>;
}

type BillingAction = 'checkout' | 'portal' | 'refresh' | null;

function billingSignal(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.hash.replace(/^#/, '')).get('billing');
}

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString();
}

export default function ProtectedDashboard({ user, onLogout }: ProtectedDashboardProps) {
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<BillingAction>(null);
  const [error, setError] = useState<string | null>(null);
  const signal = billingSignal();

  const refreshProfile = useCallback(async () => {
    setError(null);
    try {
      setProfile(await fetchAccount(user));
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Your server account could not be loaded.',
      );
    } finally {
      setLoading(false);
      setAction(null);
    }
  }, [user]);

  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  const redirectToStripe = async (target: 'checkout' | 'portal') => {
    setAction(target);
    setError(null);
    try {
      const url = target === 'checkout' ? await createCheckout(user) : await createPortal(user);
      window.location.assign(url);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Stripe could not be opened.',
      );
      setAction(null);
    }
  };

  const planLabel = profile?.plan === 'pro' ? 'Pro' : 'Free';
  const periodEnd = formatDate(profile?.currentPeriodEnd ?? null);
  const canStartCheckout =
    profile !== null &&
    !['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused'].includes(
      profile.subscriptionStatus,
    );

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

        {signal === 'processing' && !profile?.entitled ? (
          <div className="notice billing-banner" role="status">
            Stripe returned successfully. Access is waiting for the verified webhook—this page does
            not grant Pro from the redirect.
          </div>
        ) : null}
        {signal === 'canceled' ? (
          <div className="notice billing-banner" role="status">
            Checkout was canceled. Nothing was charged and your plan did not change.
          </div>
        ) : null}
        {error ? <div className="error-notice billing-banner" role="alert">{error}</div> : null}

        <section className="dashboard-grid">
          <article className="dashboard-card feature-card">
            <p className="eyebrow">Analysis</p>
            <h2>Secure billing boundary ready</h2>
            <p className="muted">
              Firebase proves identity and Stripe webhooks control entitlement. Call analysis stays
              disabled until usage enforcement and Gemini are connected server-side.
            </p>
            <div className="notice" role="status">
              No Gemini credential or AI request is exposed to this browser.
            </div>
          </article>

          <article className="dashboard-card billing-card">
            <p className="eyebrow">Billing</p>
            <h2>{loading ? 'Loading plan…' : `${planLabel} plan`}</h2>
            {profile ? (
              <>
                <div className="billing-meta">
                  <span className={`status-pill ${profile.entitled ? 'is-active' : ''}`}>
                    <span className="status-dot" aria-hidden="true" />
                    {profile.subscriptionStatus.replaceAll('_', ' ')}
                  </span>
                  {periodEnd ? (
                    <span className="muted">
                      {profile.cancelAtPeriodEnd ? 'Ends' : 'Renews'} {periodEnd}
                    </span>
                  ) : null}
                </div>
                {profile.subscriptionStatus === 'past_due' ? (
                  <p className="billing-warning">
                    Payment needs attention. Temporary grace access lasts up to seven days.
                  </p>
                ) : null}
                <div className="card-actions">
                  {canStartCheckout ? (
                    <button
                      className="primary-button"
                      type="button"
                      disabled={action !== null}
                      onClick={() => void redirectToStripe('checkout')}
                    >
                      {action === 'checkout' ? 'Opening Stripe…' : 'Upgrade to Pro — €49/month'}
                    </button>
                  ) : null}
                  {profile.hasBillingAccount ? (
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={action !== null}
                      onClick={() => void redirectToStripe('portal')}
                    >
                      {action === 'portal' ? 'Opening portal…' : 'Manage billing'}
                    </button>
                  ) : null}
                  <button
                    className="text-button"
                    type="button"
                    disabled={action !== null}
                    onClick={() => {
                      setAction('refresh');
                      void refreshProfile();
                    }}
                  >
                    {action === 'refresh' ? 'Checking…' : 'Refresh billing status'}
                  </button>
                </div>
              </>
            ) : (
              <p className="muted">The authoritative server profile is not available yet.</p>
            )}
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
            <h2>Milestone 3 foundation</h2>
            <ul className="trust-list">
              <li>Server Price allowlist and verified Firebase UID</li>
              <li>Signed raw-body Stripe webhooks with event deduplication</li>
              <li>Webhook-controlled plan, status, and entitlement</li>
            </ul>
          </article>
        </section>
      </div>
    </main>
  );
}
