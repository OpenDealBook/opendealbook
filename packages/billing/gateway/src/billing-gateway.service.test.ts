import { describe, expect, it } from 'vitest';

import type { Subscription } from '@tuckin/billing';

import { createBillingGatewayService } from './billing-gateway.service';
import type { BillingStrategy } from './billing-strategy';

const baseSubscription: Subscription = {
  id: 'sub_seed',
  accountId: 'acc_1',
  customerId: 'cus_1',
  status: 'active',
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
      quantity: 1,
      interval: 'month',
      intervalCount: 1,
      type: 'per_seat',
    },
  ],
};

function createEchoStrategy(): BillingStrategy {
  return {
    createCheckoutSession: async (params) => ({
      checkoutToken: params.productId,
    }),
    createBillingPortalSession: async (params) => ({ url: params.returnUrl }),
    cancelSubscription: async () => undefined,
    retrieveSubscription: async (subscriptionId) => ({
      ...baseSubscription,
      id: subscriptionId,
    }),
    updateSubscription: async (params) => ({
      ...baseSubscription,
      id: params.subscriptionId,
      lineItems: [
        { ...baseSubscription.lineItems[0]!, quantity: params.quantity },
      ],
    }),
    getCheckoutSession: async (sessionId) => ({
      status: 'complete',
      subscriptionId: sessionId,
    }),
  };
}

describe('createBillingGatewayService', () => {
  it('delegates checkout session creation to the strategy', async () => {
    const service = createBillingGatewayService(createEchoStrategy());

    const result = await service.createCheckoutSession({
      accountId: 'acc_1',
      productId: 'prod_42',
      planId: 'plan_1',
      returnUrl: 'https://app/return',
    });

    expect(result.checkoutToken).toBe('prod_42');
  });

  it('delegates billing portal session creation to the strategy', async () => {
    const service = createBillingGatewayService(createEchoStrategy());

    const result = await service.createBillingPortalSession({
      customerId: 'cus_1',
      returnUrl: 'https://app/portal',
    });

    expect(result.url).toBe('https://app/portal');
  });

  it('delegates subscription cancellation to the strategy', async () => {
    const service = createBillingGatewayService(createEchoStrategy());

    await expect(
      service.cancelSubscription({ subscriptionId: 'sub_9' }),
    ).resolves.toBeUndefined();
  });

  it('delegates subscription retrieval to the strategy', async () => {
    const service = createBillingGatewayService(createEchoStrategy());

    const subscription = await service.retrieveSubscription('sub_7');

    expect(subscription.id).toBe('sub_7');
  });

  it('delegates subscription updates to the strategy', async () => {
    const service = createBillingGatewayService(createEchoStrategy());

    const subscription = await service.updateSubscription({
      subscriptionId: 'sub_3',
      lineItemId: 'si_1',
      quantity: 5,
    });

    expect(subscription.id).toBe('sub_3');
    expect(subscription.lineItems[0]?.quantity).toBe(5);
  });

  it('delegates checkout session retrieval to the strategy', async () => {
    const service = createBillingGatewayService(createEchoStrategy());

    const session = await service.getCheckoutSession('cs_123');

    expect(session.subscriptionId).toBe('cs_123');
  });
});
