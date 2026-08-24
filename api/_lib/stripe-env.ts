import { ServerConfigurationError } from './api-errors.js';

export interface StripeEnvironment {
  secretKey: string;
  webhookSecret: string;
  proMonthlyPriceId: string;
  appUrl: string;
}

const stripeNames = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_PRO_MONTHLY_PRICE_ID',
  'APP_URL',
] as const;

function isMissingOrPlaceholder(value: string | undefined): boolean {
  if (!value?.trim()) {
    return true;
  }

  return /(?:replace[-_ ]with|placeholder|your[-_ ])/i.test(value);
}

function isAllowedTestKey(value: string): boolean {
  return value.startsWith('sk_test_') || value.startsWith('rk_test_');
}

function normalizeAppUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.protocol !== 'https:' && !(isLocalhost && url.protocol === 'http:')) {
      return null;
    }

    url.hash = '';
    url.search = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

export function loadStripeEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): StripeEnvironment {
  const missingNames = stripeNames.filter((name) => isMissingOrPlaceholder(environment[name]));
  if (missingNames.length > 0) {
    throw new ServerConfigurationError(missingNames);
  }

  const secretKey = environment.STRIPE_SECRET_KEY!.trim();
  const webhookSecret = environment.STRIPE_WEBHOOK_SECRET!.trim();
  const proMonthlyPriceId = environment.STRIPE_PRO_MONTHLY_PRICE_ID!.trim();
  const appUrl = normalizeAppUrl(environment.APP_URL!.trim());
  const invalidNames: string[] = [];

  if (!isAllowedTestKey(secretKey)) {
    invalidNames.push('STRIPE_SECRET_KEY');
  }
  if (!webhookSecret.startsWith('whsec_')) {
    invalidNames.push('STRIPE_WEBHOOK_SECRET');
  }
  if (!proMonthlyPriceId.startsWith('price_')) {
    invalidNames.push('STRIPE_PRO_MONTHLY_PRICE_ID');
  }
  if (!appUrl) {
    invalidNames.push('APP_URL');
  }

  if (invalidNames.length > 0) {
    throw new ServerConfigurationError(invalidNames);
  }

  return Object.freeze({
    secretKey,
    webhookSecret,
    proMonthlyPriceId,
    appUrl: appUrl!,
  });
}

export function isAllowedProPrice(priceId: string, environment: StripeEnvironment): boolean {
  return priceId === environment.proMonthlyPriceId;
}
