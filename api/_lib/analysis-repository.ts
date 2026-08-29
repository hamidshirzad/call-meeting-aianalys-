import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { ApiError } from './api-errors.js';
import {
  FREE_MONTHLY_ANALYSIS_LIMIT,
  PRO_MONTHLY_ANALYSIS_LIMIT,
  usagePeriod,
} from './analysis-policy.js';
import { isSubscriptionEntitled } from './entitlement-policy.js';
import type { VerifiedPrincipal } from './firebase-auth.js';
import {
  UserProfileRepository,
  type SubscriptionStatus,
} from './user-profile-repository.js';
import type { AnalysisUsageSummary, SavedAnalysisReport } from '../../types.js';

export interface UsageReservation {
  uid: string;
  id: string;
  period: string;
  plan: 'free' | 'pro';
  limit: number;
}

function nonNegativeInteger(value: unknown): number {
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : 0;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

const supportedSubscriptionStatuses = new Set<SubscriptionStatus>([
  'none', 'active', 'trialing', 'past_due', 'unpaid', 'canceled',
  'incomplete', 'incomplete_expired', 'paused',
]);

function planAndLimit(profile: Record<string, unknown>) {
  const status =
    typeof profile.subscriptionStatus === 'string' &&
    supportedSubscriptionStatuses.has(profile.subscriptionStatus as SubscriptionStatus)
      ? profile.subscriptionStatus as SubscriptionStatus
      : 'none';
  const pro =
    profile.plan === 'pro' &&
    isSubscriptionEntitled(status, stringOrNull(profile.pastDueSince));
  return pro
    ? { plan: 'pro' as const, limit: PRO_MONTHLY_ANALYSIS_LIMIT }
    : { plan: 'free' as const, limit: FREE_MONTHLY_ANALYSIS_LIMIT };
}

export class AnalysisRepository {
  constructor(
    private readonly firestore: Firestore,
    private readonly ensureProfile: (principal: VerifiedPrincipal) => Promise<unknown> =
      (principal) => new UserProfileRepository(firestore).getOrCreate(principal),
  ) {}

  /**
   * Repairs reservations created by the retired browser-to-Gemini upload flow.
   * Those rows are uniquely identifiable by `geminiNonce`; new reservations
   * never contain it, so an active analysis cannot be released here.
   */
  async releaseLegacyUploadReservations(uid: string): Promise<void> {
    const userReference = this.firestore.collection('users').doc(uid);
    const snapshot = await userReference
      .collection('analysisReservations')
      .where('status', '==', 'reserved')
      .limit(50)
      .get();
    const legacyReferences = snapshot.docs
      .filter((document) => typeof document.data().geminiNonce === 'string')
      .map((document) => document.ref);
    if (legacyReferences.length === 0) return;

    await this.firestore.runTransaction(async (transaction) => {
      const reservationSnapshots = await Promise.all(
        legacyReferences.map((reference) => transaction.get(reference)),
      );
      const active = reservationSnapshots.filter((reservationSnapshot) =>
        reservationSnapshot.exists &&
        reservationSnapshot.data()?.status === 'reserved' &&
        typeof reservationSnapshot.data()?.geminiNonce === 'string',
      );
      if (active.length === 0) return;

      // Release against each reservation's own period. A stranded reservation
      // from a previous month must not decrement this month's counter: that
      // leaves the old month overcounted and hands the user a free slot now.
      const countByPeriod = new Map<string, number>();
      for (const reservationSnapshot of active) {
        const period = typeof reservationSnapshot.data()?.period === 'string'
          ? reservationSnapshot.data()!.period as string
          : usagePeriod();
        countByPeriod.set(period, (countByPeriod.get(period) ?? 0) + 1);
      }

      const usageEntries = await Promise.all(
        [...countByPeriod].map(async ([period, count]) => {
          const reference = userReference.collection('usage').doc(period);
          return { reference, count, snapshot: await transaction.get(reference) };
        }),
      );

      for (const { reference, count, snapshot: usageSnapshot } of usageEntries) {
        const usage = usageSnapshot.data() ?? {};
        transaction.set(reference, {
          reserved: Math.max(0, nonNegativeInteger(usage.reserved) - count),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      }

      for (const reservationSnapshot of active) {
        transaction.update(reservationSnapshot.ref, {
          status: 'released',
          releaseReason: 'legacy-browser-upload-migration',
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    });
  }

  async reserve(principal: VerifiedPrincipal, reservationId: string): Promise<UsageReservation> {
    await this.ensureProfile(principal);
    const period = usagePeriod();
    const userReference = this.firestore.collection('users').doc(principal.uid);
    const usageReference = userReference.collection('usage').doc(period);
    const reservationReference = userReference.collection('analysisReservations').doc(reservationId);

    return this.firestore.runTransaction(async (transaction) => {
      const [profileSnapshot, usageSnapshot, reservationSnapshot] = await Promise.all([
        transaction.get(userReference),
        transaction.get(usageReference),
        transaction.get(reservationReference),
      ]);
      if (!profileSnapshot.exists) throw new Error('The user profile does not exist.');
      if (reservationSnapshot.exists) throw new Error('The usage reservation already exists.');

      const { plan, limit } = planAndLimit(profileSnapshot.data() ?? {});
      const usage = usageSnapshot.data() ?? {};
      const completed = nonNegativeInteger(usage.completed);
      const reserved = nonNegativeInteger(usage.reserved);
      if (completed + reserved >= limit) {
        throw new ApiError(
          429,
          'USAGE_LIMIT_REACHED',
          `${plan === 'pro' ? 'Pro' : 'Free'} plan monthly analysis limit reached.`,
        );
      }

      transaction.set(usageReference, {
        period,
        plan,
        limit,
        completed,
        reserved: reserved + 1,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      transaction.create(reservationReference, {
        period,
        plan,
        limit,
        status: 'reserved',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { uid: principal.uid, id: reservationId, period, plan, limit };
    });
  }

  async complete(reservation: UsageReservation, report: SavedAnalysisReport): Promise<void> {
    const userReference = this.firestore.collection('users').doc(reservation.uid);
    const usageReference = userReference.collection('usage').doc(reservation.period);
    const reservationReference = userReference.collection('analysisReservations').doc(reservation.id);
    const reportReference = userReference.collection('reports').doc(report.id);

    await this.firestore.runTransaction(async (transaction) => {
      const [usageSnapshot, reservationSnapshot] = await Promise.all([
        transaction.get(usageReference),
        transaction.get(reservationReference),
      ]);
      if (!reservationSnapshot.exists || reservationSnapshot.data()?.status !== 'reserved') {
        throw new Error('The usage reservation is no longer active.');
      }
      const usage = usageSnapshot.data() ?? {};
      transaction.create(reportReference, {
        ...report,
        createdAt: FieldValue.serverTimestamp(),
      });
      transaction.set(usageReference, {
        period: reservation.period,
        plan: reservation.plan,
        limit: reservation.limit,
        completed: nonNegativeInteger(usage.completed) + 1,
        reserved: Math.max(0, nonNegativeInteger(usage.reserved) - 1),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      transaction.update(reservationReference, {
        status: 'completed',
        reportId: report.id,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
  }

  async release(reservation: UsageReservation): Promise<void> {
    const userReference = this.firestore.collection('users').doc(reservation.uid);
    const usageReference = userReference.collection('usage').doc(reservation.period);
    const reservationReference = userReference.collection('analysisReservations').doc(reservation.id);

    await this.firestore.runTransaction(async (transaction) => {
      const [usageSnapshot, reservationSnapshot] = await Promise.all([
        transaction.get(usageReference),
        transaction.get(reservationReference),
      ]);
      if (!reservationSnapshot.exists || reservationSnapshot.data()?.status !== 'reserved') return;
      const usage = usageSnapshot.data() ?? {};
      transaction.set(usageReference, {
        reserved: Math.max(0, nonNegativeInteger(usage.reserved) - 1),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      transaction.update(reservationReference, {
        status: 'released',
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
  }

  async usage(principal: VerifiedPrincipal): Promise<AnalysisUsageSummary> {
    await this.ensureProfile(principal);
    await this.releaseLegacyUploadReservations(principal.uid);
    const period = usagePeriod();
    const userReference = this.firestore.collection('users').doc(principal.uid);
    const [profileSnapshot, usageSnapshot] = await Promise.all([
      userReference.get(),
      userReference.collection('usage').doc(period).get(),
    ]);
    const { plan, limit } = planAndLimit(profileSnapshot.data() ?? {});
    const usage = usageSnapshot.data() ?? {};
    const completed = nonNegativeInteger(usage.completed);
    const reserved = nonNegativeInteger(usage.reserved);
    return {
      period,
      plan,
      completed,
      reserved,
      limit,
      remaining: Math.max(0, limit - completed - reserved),
    };
  }

  async listReports(uid: string, maximum = 30): Promise<SavedAnalysisReport[]> {
    const snapshot = await this.firestore
      .collection('users')
      .doc(uid)
      .collection('reports')
      .orderBy('timestamp', 'desc')
      .limit(Math.max(1, Math.min(50, maximum)))
      .get();

    return snapshot.docs.map((document) => document.data() as SavedAnalysisReport);
  }

  async deleteReport(uid: string, reportId: string): Promise<void> {
    if (!/^[a-zA-Z0-9-]{16,80}$/.test(reportId)) {
      throw new ApiError(400, 'REPORT_ID_INVALID', 'The report ID is invalid.');
    }
    const reference = this.firestore.collection('users').doc(uid).collection('reports').doc(reportId);
    const snapshot = await reference.get();
    if (!snapshot.exists) throw new ApiError(404, 'REPORT_NOT_FOUND', 'The report was not found.');
    await reference.delete();
  }
}
