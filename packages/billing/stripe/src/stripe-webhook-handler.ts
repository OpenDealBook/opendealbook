import type Stripe from 'stripe';

import type {
  BillingWebhookEvent,
  BillingWebhookHandler,
} from '@tuckin/billing-gateway';

import { mapStripeSubscription } from './subscription-mapper';

export class StripeWebhookHandler implements BillingWebhookHandler {
  constructor(
    private readonly stripe: Stripe,
    private readonly webhookSecret: string,
  ) {}

  async handleEvent(
    rawBody: string | Buffer,
    signature: string,
  ): Promise<BillingWebhookEvent> {
    const event = await this.stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      this.webhookSecret,
    );

    switch (event.type) {
      case 'customer.subscription.created':
        return {
          type: 'subscription.created',
          subscription: mapStripeSubscription(event.data.object),
        };

      case 'customer.subscription.updated':
        return {
          type: 'subscription.updated',
          subscription: mapStripeSubscription(event.data.object),
        };

      case 'customer.subscription.deleted':
        return {
          type: 'subscription.deleted',
          subscription: mapStripeSubscription(event.data.object),
        };

      case 'checkout.session.completed': {
        const session = event.data.object;

        return {
          type: 'checkout.completed',
          sessionId: session.id,
          customerId: optionalId(session.customer),
          subscriptionId: optionalId(session.subscription),
          accountId:
            session.client_reference_id ??
            session.metadata?.accountId ??
            undefined,
        };
      }

      default:
        throw new Error(`Unhandled Stripe event type: ${event.type}`);
    }
  }
}

function optionalId(value: string | { id: string } | null): string | undefined {
  if (value === null) {
    return undefined;
  }

  return typeof value === 'string' ? value : value.id;
}
