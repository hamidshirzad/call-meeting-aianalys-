import { useCallback, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  createCheckout,
  createPortal,
  fetchAccount,
  type AccountProfile,
} from '../lib/billing-api';
import AnalysisWorkspace from './AnalysisWorkspace';

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

function subscriptionLabel(status: AccountProfile['subscriptionStatus']): string {
  if (status === 'none') return 'No subscription';
  return status.replaceAll('_', ' ');
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
            <p className="dashboard-tagline">
              Review calls, find what worked, and improve the next conversation.
            </p>
          </div>
          <button className="secondary-button" type="button" onClick={() => void onLogout()}>
            Sign out
          </button>
        </header>

        {signal === 'processing' && !profile?.entitled ? (
          <div className="notice billing-banner" role="status">
            Your payment was received. We are confirming your Pro access; refresh your billing
            status in a moment.
          </div>
        ) : null}
        {signal === 'canceled' ? (
          <div className="notice billing-banner" role="status">
            Checkout was canceled. Nothing was charged and your plan did not change.
          </div>
        ) : null}
        {error ? <div className="error-notice billing-banner" role="alert">{error}</div> : null}

        <section className="dashboard-grid">
          <AnalysisWorkspace user={user} />

          <article className="dashboard-card billing-card">
            <p className="eyebrow">Billing</p>
            <h2>{loading ? 'Loading plan…' : `${planLabel} plan`}</h2>
            {profile ? (
              <>
                <div className="billing-meta">
                  <span className={`status-pill ${profile.entitled ? 'is-active' : ''}`}>
                    <span className="status-dot" aria-hidden="true" />
                    {subscriptionLabel(profile.subscriptionStatus)}
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
              <p className="muted">Your billing details are temporarily unavailable.</p>
            )}
          </article>

          <article className="dashboard-card">
            <p className="eyebrow">Account</p>
            <h2>Your workspace</h2>
            <p className="user-email">{user.email ?? 'Verified Firebase user'}</p>
            <p className="muted">
              Your reports and usage belong only to this signed-in account.
            </p>
          </article>

          <article className="dashboard-card feature-card">
            <p className="eyebrow">What you receive</p>
            <h2>Practical coaching after every call</h2>
            <p className="muted">
              Go beyond a transcript. Each completed analysis highlights the moments worth
              repeating and the opportunities to handle differently next time.
            </p>
            <ul className="trust-list">
              <li>Concise call summary</li>
              <li>Strengths and coaching opportunities</li>
              <li>Speaker-by-speaker transcript</li>
              <li>Private report history</li>
            </ul>
          </article>
        </section>
      </div>
    </main>
  );
}
