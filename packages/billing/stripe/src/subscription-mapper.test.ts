import type Stripe from 'stripe';
import { describe, expect, it } from 'vitest';

import { mapStripeSubscription } from './subscription-mapper';

function buildStripeSubscription(
  overrides: Partial<Stripe.Subscription> = {},
): Stripe.Subscription {
  return {
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
          quantity: 3,
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
    ...overrides,
  } as unknown as Stripe.Subscription;
}

describe('mapStripeSubscription', () => {
  it('maps a Stripe subscription onto the billing Subscription DTO', () => {
    const result = mapStripeSubscription(buildStripeSubscription());

    expect(result).toEqual({
      id: 'sub_123',
      accountId: 'acc_123',
      customerId: 'cus_123',
      status: 'active',
      currency: 'usd',
      cancelAtPeriodEnd: false,
      periodStartsAt: '2023-11-14T22:13:20.000Z',
      periodEndsAt: '2023-12-14T22:13:20.000Z',
      trialStartsAt: null,
      trialEndsAt: null,
      lineItems: [
        {
          id: 'si_123',
          productId: 'prod_123',
          variantId: 'price_123',
          quantity: 3,
          interval: 'month',
          intervalCount: 1,
          type: 'flat',
        },
      ],
    });
  });

  it('maps a metered price to a metered line item type', () => {
    const subscription = buildStripeSubscription({
      items: {
        data: [
          {
            id: 'si_metered',
            current_period_start: 1_700_000_000,
            current_period_end: 1_702_592_000,
            price: {
              id: 'price_metered',
              product: 'prod_metered',
              recurring: {
                interval: 'year',
                interval_count: 1,
                usage_type: 'metered',
              },
            },
          },
        ],
      },
    } as unknown as Partial<Stripe.Subscription>);

    const [lineItem] = mapStripeSubscription(subscription).lineItems;

    expect(lineItem).toMatchObject({ type: 'metered', quantity: 1 });
  });

  it('translates trial timestamps into ISO strings', () => {
    const result = mapStripeSubscription(
      buildStripeSubscription({
        trial_start: 1_700_000_000,
        trial_end: 1_701_000_000,
      }),
    );

    expect(result.trialStartsAt).toBe('2023-11-14T22:13:20.000Z');
    expect(result.trialEndsAt).toBe('2023-11-26T12:00:00.000Z');
  });
});
