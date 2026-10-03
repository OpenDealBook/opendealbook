import { beforeEach, describe, expect, it, vi } from 'vitest';

const handleEvent = vi.fn();
const rpc = vi.fn();
const single = vi.fn();
const eq = vi.fn(() => ({ single }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));
const stopTrialDrip = vi.fn();

vi.mock('@odb/stripe', () => ({
  createStripeWebhookHandler: () => ({ handleEvent }),
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerAdminClient: () => ({ rpc, from }),
}));

vi.mock('@odb/workflows/client', () => ({ stopTrialDrip }));

const { handleBillingWebhook } = await import('./handle-billing-webhook');

function activeSubscriptionEvent() {
  return {
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
  };
}

describe('handleBillingWebhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    single.mockResolvedValue({
      data: { primary_owner_user_id: 'user_owner_123' },
    });
    stopTrialDrip.mockResolvedValue(undefined);
  });

  it('upserts the subscription with the mapped payload on subscription.updated', async () => {
    handleEvent.mockResolvedValue(activeSubscriptionEvent());

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

  it('stops the trial drip for the account owner when a subscription becomes active', async () => {
    handleEvent.mockResolvedValue(activeSubscriptionEvent());

    await handleBillingWebhook('raw-body', 'signature');

    expect(from).toHaveBeenCalledWith('accounts');
    expect(eq).toHaveBeenCalledWith('id', 'acc_123');
    expect(stopTrialDrip).toHaveBeenCalledWith('user_owner_123');
  });

  it('still processes the webhook when stopping the trial drip rejects', async () => {
    handleEvent.mockResolvedValue(activeSubscriptionEvent());
    stopTrialDrip.mockRejectedValue(new Error('Temporal unavailable'));

    await expect(
      handleBillingWebhook('raw-body', 'signature'),
    ).resolves.toBeUndefined();

    expect(rpc).toHaveBeenCalled();
  });
});
