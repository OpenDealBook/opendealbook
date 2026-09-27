function requireEnv(name: string): string {
  const value = process.env[name];

  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getStripeSecretKey(): string {
  return requireEnv('STRIPE_SECRET_KEY');
}

export function getStripeWebhookSecret(): string {
  return requireEnv('STRIPE_WEBHOOK_SECRET');
}
