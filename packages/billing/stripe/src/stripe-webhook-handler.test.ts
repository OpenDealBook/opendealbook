import type Stripe from 'stripe';
import { describe, expect, it, vi } from 'vitest';

import { StripeWebhookHandler } from './stripe-webhook-handler';

function stripeWith(
  constructEventAsync: Stripe['webhooks']['constructEventAsync'],
): Stripe {
  return { webhooks: { constructEventAsync } } as unknown as Stripe;
}

describe('StripeWebhookHandler', () => {
  it('maps a checkout.session.completed event to a checkout.completed event', async () => {
    const stripe = stripeWith(
      vi.fn().mockResolvedValue({
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_123',
            customer: 'cus_123',
            subscription: 'sub_123',
          },
        },
      }) as unknown as Stripe['webhooks']['constructEventAsync'],
    );

    const handler = new StripeWebhookHandler(stripe, 'whsec_test');

    const result = await handler.handleEvent('{}', 'sig');

    expect(result).toEqual({
      type: 'checkout.completed',
      sessionId: 'cs_123',
      customerId: 'cus_123',
      subscriptionId: 'sub_123',
    });
  });

  it('maps a customer.subscription.updated event to a subscription.updated event', async () => {
    const stripe = stripeWith(
      vi.fn().mockResolvedValue({
        type: 'customer.subscription.updated',
        data: {
          object: {
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
                  quantity: 1,
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
          },
        },
      }) as unknown as Stripe['webhooks']['constructEventAsync'],
    );

    const handler = new StripeWebhookHandler(stripe, 'whsec_test');

    const result = await handler.handleEvent('{}', 'sig');

    expect(result).toMatchObject({
      type: 'subscription.updated',
      subscription: { id: 'sub_123', accountId: 'acc_123', status: 'active' },
    });
  });

  it('rejects when the signature cannot be verified', async () => {
    const stripe = stripeWith(
      vi
        .fn()
        .mockRejectedValue(
          new Error('Invalid signature'),
        ) as unknown as Stripe['webhooks']['constructEventAsync'],
    );

    const handler = new StripeWebhookHandler(stripe, 'whsec_test');

    await expect(handler.handleEvent('{}', 'bad-sig')).rejects.toThrow(
      'Invalid signature',
    );
  });
});
