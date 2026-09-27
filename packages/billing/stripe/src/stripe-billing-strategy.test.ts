import type Stripe from 'stripe';
import { describe, expect, it, vi } from 'vitest';

import { StripeBillingStrategy } from './stripe-billing-strategy';

const stripeSubscription = {
  id: 'sub_123',
  customer: 'cus_123',
  status: 'active',
  currency: 'usd',
  cancel_at_period_end: false,
  trial_start: null,
  trial_end: null,
  metadata: { accountId: 'acc_123' },
  items: {
    data: [
      {
        id: 'si_123',
        quantity: 2,
        current_period_start: 1_700_000_000,
        current_period_end: 1_702_592_000,
        price: {
          id: 'price_123',
          product: 'prod_123',
          recurring: {
            interval: 'month',
            interval_count: 1,
            usage_type: 'licensed',
          },
        },
      },
    ],
  },
};

describe('StripeBillingStrategy', () => {
  it('maps a retrieved subscription onto the billing Subscription DTO', async () => {
    const stripe = {
      subscriptions: {
        retrieve: vi.fn().mockResolvedValue(stripeSubscription),
      },
    } as unknown as Stripe;

    const strategy = new StripeBillingStrategy(stripe);

    const result = await strategy.retrieveSubscription('sub_123');

    expect(result).toMatchObject({
      id: 'sub_123',
      accountId: 'acc_123',
      customerId: 'cus_123',
      status: 'active',
      lineItems: [
        { id: 'si_123', quantity: 2, interval: 'month', type: 'flat' },
      ],
    });
  });

  it('returns the client secret of a created checkout session as the checkout token', async () => {
    const stripe = {
      checkout: {
        sessions: {
          create: vi.fn().mockResolvedValue({ client_secret: 'cs_secret_123' }),
        },
      },
    } as unknown as Stripe;

    const strategy = new StripeBillingStrategy(stripe);

    const result = await strategy.createCheckoutSession({
      accountId: 'acc_123',
      customerEmail: 'buyer@example.com',
      productId: 'prod_123',
      planId: 'price_123',
      returnUrl: 'https://app.test/return',
    });

    expect(result).toEqual({ checkoutToken: 'cs_secret_123' });
  });

  it('exposes the identifiers of a retrieved checkout session', async () => {
    const stripe = {
      checkout: {
        sessions: {
          retrieve: vi.fn().mockResolvedValue({
            status: 'complete',
            customer: 'cus_123',
            subscription: 'sub_123',
          }),
        },
      },
    } as unknown as Stripe;

    const strategy = new StripeBillingStrategy(stripe);

    const result = await strategy.getCheckoutSession('cs_123');

    expect(result).toEqual({
      status: 'complete',
      customerId: 'cus_123',
      subscriptionId: 'sub_123',
    });
  });
});
