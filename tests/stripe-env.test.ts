import { describe, expect, it } from 'vitest';
import { ServerConfigurationError } from '../api/_lib/api-errors';
import { loadStripeEnvironment } from '../api/_lib/stripe-env';

const validEnvironment = {
  STRIPE_SECRET_KEY: 'sk_test_example',
  STRIPE_WEBHOOK_SECRET: 'whsec_example',
  STRIPE_PRO_MONTHLY_PRICE_ID: 'price_pro_monthly',
  APP_URL: 'https://preview.example.com/',
};

describe('test-mode Stripe environment', () => {
  it('loads and normalizes server-only settings', () => {
    expect(loadStripeEnvironment(validEnvironment)).toEqual({
      secretKey: 'sk_test_example',
      webhookSecret: 'whsec_example',
      proMonthlyPriceId: 'price_pro_monthly',
      appUrl: 'https://preview.example.com',
    });
  });

  it('accepts least-privilege restricted test keys', () => {
    expect(
      loadStripeEnvironment({ ...validEnvironment, STRIPE_SECRET_KEY: 'rk_test_example' })
        .secretKey,
    ).toBe('rk_test_example');
  });

  it('rejects missing and placeholder settings', () => {
    expect(() => loadStripeEnvironment({})).toThrowError(ServerConfigurationError);
    expect(() =>
      loadStripeEnvironment({
        ...validEnvironment,
        STRIPE_PRO_MONTHLY_PRICE_ID: 'server-only-test-price-placeholder',
      }),
    ).toThrowError(ServerConfigurationError);
  });

  it('fails closed on live keys, malformed identifiers, and unsafe URLs', () => {
    for (const environment of [
      { ...validEnvironment, STRIPE_SECRET_KEY: 'sk_live_forbidden' },
      { ...validEnvironment, STRIPE_WEBHOOK_SECRET: 'not-a-webhook-secret' },
      { ...validEnvironment, STRIPE_PRO_MONTHLY_PRICE_ID: 'client-price' },
      { ...validEnvironment, APP_URL: 'http://preview.example.com' },
    ]) {
      expect(() => loadStripeEnvironment(environment)).toThrowError(ServerConfigurationError);
    }
  });

  it('allows HTTP only for local development', () => {
    expect(loadStripeEnvironment({ ...validEnvironment, APP_URL: 'http://localhost:3000/' }))
      .toMatchObject({ appUrl: 'http://localhost:3000' });
  });
});
