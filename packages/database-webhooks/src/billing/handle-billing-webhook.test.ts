import { describe, expect, it, vi } from 'vitest';

const handleEvent = vi.fn();
const rpc = vi.fn();

vi.mock('@tuckin/stripe', () => ({
  createStripeWebhookHandler: () => ({ handleEvent }),
}));

vi.mock('@tuckin/supabase/server', () => ({
  getSupabaseServerAdminClient: () => ({ rpc }),
}));

const { handleBillingWebhook } = await import('./handle-billing-webhook');

describe('handleBillingWebhook', () => {
  it('upserts the subscription with the mapped payload on subscription.updated', async () => {
    handleEvent.mockResolvedValue({
      type: 'subscription.updated',
      subscription: {
        id: 'sub_123',
        accountId: 'acc_123',
        customerId: 'cus_123',
        status: 'active',
        currency: 'usd',
        cancelAtPeriodEnd: false,
        periodStartsAt: '2026-01-01T00:00:00Z',
        periodEndsAt: '2026-02-01T00:00:00Z',
        trialStartsAt: null,
        trialEndsAt: null,
        lineItems: [
          {
            id: 'si_1',
            productId: 'prod_1',
            variantId: 'price_1',
            quantity: 1,
            interval: 'month',
            intervalCount: 1,
            type: 'flat',
          },
        ],
      },
    });

    await handleBillingWebhook('raw-body', 'signature');

    expect(rpc).toHaveBeenCalledWith('upsert_subscription', {
      active: true,
      billing_provider: 'stripe',
      cancel_at_period_end: false,
      currency: 'usd',
      line_items: [
        {
          id: 'si_1',
          product_id: 'prod_1',
          variant_id: 'price_1',
          quantity: 1,
          interval: 'month',
          interval_count: 1,
          type: 'flat',
        },
      ],
      period_ends_at: '2026-02-01T00:00:00Z',
      period_starts_at: '2026-01-01T00:00:00Z',
      status: 'active',
      target_account_id: 'acc_123',
      target_customer_id: 'cus_123',
      target_subscription_id: 'sub_123',
      trial_ends_at: undefined,
      trial_starts_at: undefined,
    });
  });
});
