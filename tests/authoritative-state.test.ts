import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('authoritative identity and entitlement boundary', () => {
  const appSource = readFileSync(resolve('App.tsx'), 'utf8');
  const entrySource = readFileSync(resolve('index.tsx'), 'utf8');
  const dashboardSource = readFileSync(resolve('components/ProtectedDashboard.tsx'), 'utf8');

  it('contains no shared demo identity', () => {
    const source = `${appSource}\n${entrySource}`;
    expect(source).not.toContain('user_12345');
    expect(source).not.toContain('user@example.com');
  });

  it('contains no local plan or entitlement persistence', () => {
    const source = `${appSource}\n${dashboardSource}`;
    expect(source).not.toContain("localStorage.setItem('user-details'");
    expect(source).not.toContain("localStorage.setItem('plan'");
    expect(source).not.toContain('customApiKey');
    expect(source).not.toContain("? 'pro'");
  });

  it('does not claim authentication proves a subscription', () => {
    expect(dashboardSource).toContain('Authentication proves who you are—not whether you paid.');
    expect(dashboardSource).toContain('No plan assigned');
  });
});
