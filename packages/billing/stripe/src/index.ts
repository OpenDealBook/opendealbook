import { getStripeWebhookSecret } from './env';
import { StripeBillingStrategy } from './stripe-billing-strategy';
import { createStripeClient } from './stripe-client';
import { StripeWebhookHandler } from './stripe-webhook-handler';

export { createStripeClient } from './stripe-client';
export { StripeBillingStrategy } from './stripe-billing-strategy';
export { StripeWebhookHandler } from './stripe-webhook-handler';
export { mapStripeSubscription } from './subscription-mapper';

export function createStripeBillingStrategy(): StripeBillingStrategy {
  return new StripeBillingStrategy(createStripeClient());
}

export function createStripeWebhookHandler(): StripeWebhookHandler {
  return new StripeWebhookHandler(
    createStripeClient(),
    getStripeWebhookSecret(),
  );
}
