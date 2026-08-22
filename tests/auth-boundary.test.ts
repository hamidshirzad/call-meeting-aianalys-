import { describe, expect, it } from 'vitest';
import { shouldRenderDashboard } from '../App';

const authenticatedUser = { uid: 'firebase-user' } as never;

describe('authentication boundary', () => {
  it('denies the dashboard when no Firebase user exists', () => {
    expect(shouldRenderDashboard({ status: 'unauthenticated', user: null })).toBe(false);
    expect(shouldRenderDashboard({ status: 'loading', user: null })).toBe(false);
  });

  it('requires both authenticated status and a Firebase user', () => {
    expect(shouldRenderDashboard({ status: 'authenticated', user: null })).toBe(false);
    expect(
      shouldRenderDashboard({ status: 'authenticated', user: authenticatedUser }),
    ).toBe(true);
  });
});
