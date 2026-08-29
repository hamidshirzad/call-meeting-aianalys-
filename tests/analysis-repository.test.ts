import type { Firestore } from 'firebase-admin/firestore';
import { describe, expect, it, vi } from 'vitest';
import { AnalysisRepository } from '../api/_lib/analysis-repository';
import { usagePeriod } from '../api/_lib/analysis-policy';
import type { VerifiedPrincipal } from '../api/_lib/firebase-auth';
import type { SavedAnalysisReport } from '../types';

interface FakeReference {
  path: string;
  collection(name: string): FakeCollection;
  get(): Promise<FakeSnapshot>;
  delete(): Promise<void>;
}

interface FakeCollection {
  doc(id: string): FakeReference;
  where(): FakeCollection;
  limit(): FakeCollection;
  get(): Promise<{ docs: Array<{ ref: FakeReference; data(): Record<string, unknown> }> }>;
}

interface FakeSnapshot {
  exists: boolean;
  ref: FakeReference;
  data(): Record<string, unknown> | undefined;
}

function createFirestore(profile: Record<string, unknown>) {
  const records = new Map<string, Record<string, unknown>>([
    ['users/verified-uid', profile],
  ]);
  const snapshot = (reference: FakeReference): FakeSnapshot => ({
    exists: records.has(reference.path),
    ref: reference,
    data: () => records.get(reference.path),
  });
  const reference = (path: string): FakeReference => ({
    path,
    collection: (name) => collection(`${path}/${name}`),
    get: async () => snapshot(reference(path)),
    delete: async () => { records.delete(path); },
  });
  const collection = (path: string): FakeCollection => ({
    doc: (id) => reference(`${path}/${id}`),
    where: () => collection(path),
    limit: () => collection(path),
    get: async () => ({
      docs: [...records.entries()]
        .filter(([recordPath, data]) =>
          recordPath.startsWith(`${path}/`) &&
          !recordPath.slice(path.length + 1).includes('/') &&
          data.status === 'reserved',
        )
        .map(([recordPath, data]) => ({
          ref: reference(recordPath),
          data: () => data,
        })),
    }),
  });
  const transaction = {
    get: vi.fn(async (target: FakeReference) => snapshot(target)),
    create: vi.fn((target: FakeReference, data: Record<string, unknown>) => {
      if (records.has(target.path)) throw new Error('already exists');
      records.set(target.path, { ...data });
    }),
    set: vi.fn((target: FakeReference, data: Record<string, unknown>, options?: { merge?: boolean }) => {
      records.set(target.path, options?.merge
        ? { ...records.get(target.path), ...data }
        : { ...data });
    }),
    update: vi.fn((target: FakeReference, data: Record<string, unknown>) => {
      if (!records.has(target.path)) throw new Error('not found');
      records.set(target.path, { ...records.get(target.path), ...data });
    }),
  };
  let queue: Promise<unknown> = Promise.resolve();
  const runTransaction = vi.fn(<T>(callback: (value: typeof transaction) => Promise<T>) => {
    const result = queue.then(() => callback(transaction));
    queue = result.then(() => undefined, () => undefined);
    return result;
  });
  const firestore = {
    collection: (name: string) => collection(name),
    runTransaction,
  } as unknown as Firestore;
  return { firestore, records };
}

const principal: VerifiedPrincipal = {
  uid: 'verified-uid',
  email: 'owner@example.com',
  emailVerified: true,
  displayName: 'Owner',
};

function report(id: string): SavedAnalysisReport {
  return {
    id,
    timestamp: '2026-08-23T00:00:00.000Z',
    fileName: 'call.mp3',
    durationSeconds: 30,
    diarizedTranscript: [{ speaker: 'Agent', text: 'Hello' }],
    sentimentData: [],
    coachingCard: { strengths: [], opportunities: [] },
    summary: 'Summary',
  };
}

describe('transactional analysis usage', () => {
  it('allows only five concurrent Free reservations', async () => {
    const fake = createFirestore({ plan: 'free', subscriptionStatus: 'none' });
    const repository = new AnalysisRepository(fake.firestore, async () => undefined);
    const attempts = await Promise.allSettled(
      Array.from({ length: 6 }, (_, index) => repository.reserve(principal, `free-${index}`)),
    );
    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(5);
    expect(attempts.filter((attempt) => attempt.status === 'rejected')).toHaveLength(1);
    expect(fake.records.get(`users/verified-uid/usage/${usagePeriod()}`)).toMatchObject({
      completed: 0,
      reserved: 5,
      limit: 5,
    });
  });

  it('allows only fifty concurrent entitled Pro reservations', async () => {
    const fake = createFirestore({ plan: 'pro', subscriptionStatus: 'active' });
    const repository = new AnalysisRepository(fake.firestore, async () => undefined);
    const attempts = await Promise.allSettled(
      Array.from({ length: 51 }, (_, index) => repository.reserve(principal, `pro-${index}`)),
    );
    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(50);
    expect(attempts.filter((attempt) => attempt.status === 'rejected')).toHaveLength(1);
  });

  it('charges only completed reports and releases failed processing', async () => {
    const fake = createFirestore({ plan: 'free', subscriptionStatus: 'none' });
    const repository = new AnalysisRepository(fake.firestore, async () => undefined);
    const failed = await repository.reserve(principal, 'failed-request');
    await repository.release(failed);
    expect(fake.records.get(`users/verified-uid/usage/${usagePeriod()}`)).toMatchObject({
      completed: 0,
      reserved: 0,
    });

    const completed = await repository.reserve(principal, 'completed-request');
    const saved = report('7f6e6f6b-38d5-4a24-9541-90aa8d91ff21');
    await repository.complete(completed, saved);
    expect(fake.records.get(`users/verified-uid/usage/${usagePeriod()}`)).toMatchObject({
      completed: 1,
      reserved: 0,
    });
    expect(fake.records.get(`users/verified-uid/reports/${saved.id}`)).toMatchObject({
      summary: 'Summary',
    });
  });

  it('releases only reservations from the retired browser-upload format', async () => {
    const fake = createFirestore({ plan: 'pro', subscriptionStatus: 'active' });
    const period = usagePeriod();
    fake.records.set(`users/verified-uid/usage/${period}`, {
      completed: 0, reserved: 2, limit: 50,
    });
    fake.records.set('users/verified-uid/analysisReservations/legacy', {
      status: 'reserved', geminiNonce: 'old-secret',
    });
    fake.records.set('users/verified-uid/analysisReservations/current', {
      status: 'reserved',
    });
    const repository = new AnalysisRepository(fake.firestore, async () => undefined);

    const usage = await repository.usage(principal);

    expect(usage).toMatchObject({ completed: 0, reserved: 1, remaining: 49 });
    expect(fake.records.get('users/verified-uid/analysisReservations/legacy')).toMatchObject({
      status: 'released', releaseReason: 'legacy-browser-upload-migration',
    });
    expect(fake.records.get('users/verified-uid/analysisReservations/current')).toMatchObject({
      status: 'reserved',
    });
  });
});
