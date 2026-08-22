import type { SubscriptionStatus } from './user-profile-repository.js';

export const PAST_DUE_GRACE_DAYS = 7;
const pastDueGraceMilliseconds = PAST_DUE_GRACE_DAYS * 24 * 60 * 60 * 1000;

export function isSubscriptionEntitled(
  status: SubscriptionStatus,
  pastDueSince: string | null,
  now: Date = new Date(),
): boolean {
  if (status === 'active' || status === 'trialing') {
    return true;
  }

  if (status !== 'past_due' || !pastDueSince) {
    return false;
  }

  const pastDueTime = Date.parse(pastDueSince);
  if (!Number.isFinite(pastDueTime) || pastDueTime > now.getTime()) {
    return false;
  }

  return now.getTime() - pastDueTime <= pastDueGraceMilliseconds;
}
