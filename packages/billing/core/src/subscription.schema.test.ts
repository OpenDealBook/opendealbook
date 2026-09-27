import { describe, expect, it } from 'vitest';

import { SubscriptionSchema } from './subscription.schema';

const validSubscription = {
  id: 'sub_1',
  accountId: 'acc_1',
  customerId: 'cus_1',
  status: 'active' as const,
  currency: 'usd',
  cancelAtPeriodEnd: false,
  periodStartsAt: '2026-01-01T00:00:00.000Z',
  periodEndsAt: '2026-02-01T00:00:00.000Z',
  trialStartsAt: null,
  trialEndsAt: null,
  lineItems: [
    {
      id: 'si_1',
      productId: 'prod_1',
      variantId: 'price_1',
      quantity: 3,
      interval: 'month' as const,
      intervalCount: 1,
      type: 'per_seat' as const,
    },
  ],
};

describe('SubscriptionSchema', () => {
  it('accepts a subscription DTO mapped from a provider webhook', () => {
    const parsed = SubscriptionSchema.parse(validSubscription);

    expect(parsed.lineItems).toHaveLength(1);
  });

  it('rejects an unknown subscription status', () => {
    const subscription = { ...validSubscription, status: 'expired' };

    expect(() => SubscriptionSchema.parse(subscription as never)).toThrow();
  });
});
