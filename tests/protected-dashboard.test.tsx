import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { User } from 'firebase/auth';
import ProtectedDashboard from '../components/ProtectedDashboard';
import type { AccountProfile } from '../lib/billing-api';

const user = {
  email: 'owner@example.com',
  getIdToken: vi.fn(),
} as unknown as User;

const freeProfile: AccountProfile = {
  uid: 'verified-uid',
  email: 'owner@example.com',
  emailVerified: true,
  displayName: 'Owner',
  plan: 'free',
  subscriptionStatus: 'none',
  entitled: false,
  hasBillingAccount: false,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  createdAt: '2026-08-22T12:00:00.000Z',
  updatedAt: '2026-08-22T12:00:00.000Z',
};

function respondWith(profile: AccountProfile) {
  const usage = {
    period: '2026-08', plan: profile.entitled ? 'pro' : 'free', completed: 0,
    reserved: 0, limit: profile.entitled ? 50 : 5, remaining: profile.entitled ? 50 : 5,
  };
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const path = String(input);
      return Promise.resolve(new Response(JSON.stringify(
        path.includes('/api/reports') ? { reports: [], usage } : { profile },
      ), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));
    }),
  );
}

beforeEach(() => {
  vi.mocked(user.getIdToken).mockResolvedValue('firebase-token');
  window.location.hash = '';
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('protected billing dashboard', () => {
  it('renders the server Free plan and Checkout action', async () => {
    respondWith(freeProfile);
    render(<ProtectedDashboard user={user} onLogout={vi.fn()} />);

    expect(await screen.findByRole('heading', { name: 'Free plan' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upgrade to Pro — €49/month' }))
      .toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Manage billing' })).not.toBeInTheDocument();
  });

  it('shows Portal management instead of duplicate Checkout for an active subscription', async () => {
    respondWith({
      ...freeProfile,
      plan: 'pro',
      subscriptionStatus: 'active',
      entitled: true,
      hasBillingAccount: true,
      currentPeriodEnd: '2026-09-22T12:00:00.000Z',
    });
    render(<ProtectedDashboard user={user} onLogout={vi.fn()} />);

    expect(await screen.findByRole('heading', { name: 'Pro plan' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Manage billing' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Upgrade to Pro/ })).not.toBeInTheDocument();
  });

  it('treats Checkout success as webhook processing, not entitlement', async () => {
    window.location.hash = '#billing=processing';
    respondWith(freeProfile);
    render(<ProtectedDashboard user={user} onLogout={vi.fn()} />);

    expect(await screen.findByText(/waiting for the verified webhook/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Free plan' })).toBeInTheDocument();
  });
});
