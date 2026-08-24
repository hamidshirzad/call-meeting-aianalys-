import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)('Firestore rules in the emulator', () => {
  let environment: RulesTestEnvironment;

  beforeAll(async () => {
    environment = await initializeTestEnvironment({
      projectId: 'demo-fourdoor-call-coach',
      firestore: {
        rules: readFileSync(resolve('firestore.rules'), 'utf8'),
      },
    });
  });

  beforeEach(async () => {
    await environment.clearFirestore();
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users/alice'), {
        uid: 'alice',
        plan: 'free',
        entitled: false,
      });
      await setDoc(doc(context.firestore(), 'users/alice/reports/report-1'), {
        summary: 'Owned report',
      });
      await setDoc(doc(context.firestore(), 'users/alice/usage/2026-08'), {
        completed: 1,
      });
      await setDoc(doc(context.firestore(), 'stripeEvents/evt_test'), {
        processed: true,
      });
    });
  });

  afterAll(async () => {
    await environment.cleanup();
  });

  it('allows an authenticated user to read only their own profile data', async () => {
    const alice = environment.authenticatedContext('alice').firestore();
    const bob = environment.authenticatedContext('bob').firestore();
    const anonymous = environment.unauthenticatedContext().firestore();

    await assertSucceeds(getDoc(doc(alice, 'users/alice')));
    await assertSucceeds(getDoc(doc(alice, 'users/alice/reports/report-1')));
    await assertSucceeds(getDoc(doc(alice, 'users/alice/usage/2026-08')));
    await assertFails(getDoc(doc(bob, 'users/alice')));
    await assertFails(getDoc(doc(anonymous, 'users/alice')));
  });

  it('denies browser creation, updates, and deletion of authoritative profile data', async () => {
    const alice = environment.authenticatedContext('alice').firestore();

    await assertFails(setDoc(doc(alice, 'users/new-user'), { plan: 'pro' }));
    await assertFails(updateDoc(doc(alice, 'users/alice'), { entitled: true }));
    await assertFails(deleteDoc(doc(alice, 'users/alice')));
  });

  it('denies browser writes to reports and usage', async () => {
    const alice = environment.authenticatedContext('alice').firestore();

    await assertFails(setDoc(doc(alice, 'users/alice/reports/new-report'), { summary: 'x' }));
    await assertFails(updateDoc(doc(alice, 'users/alice/usage/2026-08'), { completed: 999 }));
    await assertFails(deleteDoc(doc(alice, 'users/alice/reports/report-1')));
  });

  it('denies every browser access to Stripe event records', async () => {
    const alice = environment.authenticatedContext('alice').firestore();

    await assertFails(getDoc(doc(alice, 'stripeEvents/evt_test')));
    await assertFails(setDoc(doc(alice, 'stripeEvents/evt_forged'), { processed: true }));
  });
});
