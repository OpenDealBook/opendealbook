import type { BillingWebhookEvent } from '@odb/billing-gateway';
import { getLogger } from '@odb/shared/logger';
import { createStripeWebhookHandler } from '@odb/stripe';
import { getSupabaseServerAdminClient } from '@odb/supabase/server';

type AdminClient = ReturnType<typeof getSupabaseServerAdminClient>;

type SubscriptionPayload = Extract<
  BillingWebhookEvent,
  { type: 'subscription.updated' }
>['subscription'];

const activeStatuses: ReadonlySet<SubscriptionPayload['status']> = new Set([
  'active',
  'trialing',
]);

export async function handleBillingWebhook(
  rawBody: string,
  signature: string,
): Promise<void> {
  const logger = getLogger();
  const handler = createStripeWebhookHandler();
  const event = await handler.handleEvent(rawBody, signature);

  logger.info({ type: event.type }, 'Processing billing webhook');

  await persistBillingEvent(getSupabaseServerAdminClient(), event);
}

export async function persistBillingEvent(
  client: AdminClient,
  event: BillingWebhookEvent,
): Promise<void> {
  switch (event.type) {
    case 'subscription.created':
    case 'subscription.updated':
      await upsertSubscription(client, event.subscription);
      return;

    case 'subscription.deleted':
      await cancelSubscription(client, event.subscription.id);
      return;

    case 'checkout.completed':
      getLogger().info(
        {
          sessionId: event.sessionId,
          accountId: event.accountId,
          customerId: event.customerId,
          subscriptionId: event.subscriptionId,
        },
        'Checkout completed',
      );
      return;
  }
}

async function upsertSubscription(
  client: AdminClient,
  subscription: SubscriptionPayload,
): Promise<void> {
  await client.rpc('upsert_subscription', {
    active: activeStatuses.has(subscription.status),
    billing_provider: 'stripe',
    cancel_at_period_end: subscription.cancelAtPeriodEnd,
    currency: subscription.currency,
    line_items: subscription.lineItems.map((item) => ({
      id: item.id,
      product_id: item.productId,
      variant_id: item.variantId,
      quantity: item.quantity,
      interval: item.interval,
      interval_count: item.intervalCount,
      type: item.type,
    })),
    period_ends_at: subscription.periodEndsAt,
    period_starts_at: subscription.periodStartsAt,
    status: subscription.status,
    target_account_id: subscription.accountId,
    target_customer_id: subscription.customerId,
    target_subscription_id: subscription.id,
    trial_ends_at: subscription.trialEndsAt ?? undefined,
    trial_starts_at: subscription.trialStartsAt ?? undefined,
  });
}

async function cancelSubscription(
  client: AdminClient,
  subscriptionId: string,
): Promise<void> {
  await client
    .from('subscriptions')
    .update({ status: 'canceled', active: false })
    .eq('id', subscriptionId);
}
