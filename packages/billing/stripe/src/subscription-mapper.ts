import type Stripe from 'stripe';

import type { Subscription, SubscriptionLineItem } from '@odb/billing';

export function mapStripeSubscription(
  subscription: Stripe.Subscription,
): Subscription {
  const firstItem = subscription.items.data[0]!;

  return {
    id: subscription.id,
    accountId: subscription.metadata.accountId!,
    customerId: resolveId(subscription.customer),
    status: subscription.status,
    currency: subscription.currency,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    periodStartsAt: toIsoString(firstItem.current_period_start),
    periodEndsAt: toIsoString(firstItem.current_period_end),
    trialStartsAt:
      subscription.trial_start === null
        ? null
        : toIsoString(subscription.trial_start),
    trialEndsAt:
      subscription.trial_end === null
        ? null
        : toIsoString(subscription.trial_end),
    lineItems: subscription.items.data.map(mapLineItem),
  };
}

function mapLineItem(item: Stripe.SubscriptionItem): SubscriptionLineItem {
  const price = item.price;
  const recurring = price.recurring!;

  return {
    id: item.id,
    productId: resolveId(price.product),
    variantId: price.id,
    quantity: item.quantity ?? 1,
    interval: recurring.interval as SubscriptionLineItem['interval'],
    intervalCount: recurring.interval_count,
    type: recurring.usage_type === 'metered' ? 'metered' : 'flat',
  };
}

function resolveId(value: string | { id: string }): string {
  return typeof value === 'string' ? value : value.id;
}

function toIsoString(seconds: number): string {
  return new Date(seconds * 1000).toISOString();
}
