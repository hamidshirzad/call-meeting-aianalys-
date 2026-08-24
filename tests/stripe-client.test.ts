import { describe, expect, it } from 'vitest';
import { createIntegrationIdentifier } from '../api/_lib/stripe-client';

describe('Stripe client metadata', () => {
  it('creates a bounded integration identifier with eight random letters', () => {
    const identifier = createIntegrationIdentifier(
      new Uint8Array([0, 1, 2, 3, 4, 25, 26, 27]),
    );

    expect(identifier).toBe('fourdoor_call_coach_abcdezab');
    expect(identifier).toMatch(/^fourdoor_call_coach_[a-z]{8}$/);
  });

  it('rejects insufficient randomness', () => {
    expect(() => createIntegrationIdentifier(new Uint8Array(7))).toThrowError(
      'Eight random bytes are required.',
    );
  });
});
