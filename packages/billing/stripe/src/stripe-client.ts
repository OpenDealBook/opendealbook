import Stripe from 'stripe';

import { getStripeSecretKey } from './env';

export function createStripeClient(): Stripe {
  return new Stripe(getStripeSecretKey());
}
