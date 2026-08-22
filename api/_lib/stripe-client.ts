import Stripe from 'stripe';
import { loadStripeEnvironment } from './stripe-env.js';

let cachedStripeClient: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (cachedStripeClient) {
    return cachedStripeClient;
  }

  const environment = loadStripeEnvironment();
  cachedStripeClient = new Stripe(environment.secretKey, {
    apiVersion: '2026-07-29.dahlia',
    maxNetworkRetries: 2,
    timeout: 20_000,
    appInfo: {
      name: 'FourDoorAI Call Coach',
      version: '0.1.0',
    },
  });

  return cachedStripeClient;
}

export function createIntegrationIdentifier(randomValues: Uint8Array): string {
  if (randomValues.length < 8) {
    throw new Error('Eight random bytes are required.');
  }

  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  const suffix = Array.from(randomValues.slice(0, 8), (value) => alphabet[value % 26]).join('');
  return `fourdoor_call_coach_${suffix}`;
}

export function generateIntegrationIdentifier(): string {
  return createIntegrationIdentifier(crypto.getRandomValues(new Uint8Array(8)));
}
