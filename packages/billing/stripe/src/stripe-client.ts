import Stripe from 'stripe';

import { getStripeApiBase, getStripeSecretKey } from './env';

export function createStripeClient(): Stripe {
  return new Stripe(getStripeSecretKey(), getStripeApiBase());
}
