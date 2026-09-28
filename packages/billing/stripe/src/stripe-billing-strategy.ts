import type Stripe from 'stripe';

import type { Subscription } from '@odb/billing';
import type {
  BillingStrategy,
  CheckoutSessionStatus,
} from '@odb/billing-gateway';

import { mapStripeSubscription } from './subscription-mapper';

export class StripeBillingStrategy implements BillingStrategy {
  constructor(private readonly stripe: Stripe) {}

  async createCheckoutSession(params: {
    accountId: string;
    customerId?: string;
    customerEmail?: string;
    productId: string;
    planId: string;
    returnUrl: string;
    quantity?: number;
  }): Promise<{ checkoutToken: string }> {
    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      ui_mode: 'embedded_page',
      client_reference_id: params.accountId,
      customer: params.customerId,
      customer_email: params.customerId ? undefined : params.customerEmail,
      line_items: [{ price: params.planId, quantity: params.quantity ?? 1 }],
      subscription_data: { metadata: { accountId: params.accountId } },
      return_url: `${params.returnUrl}?session_id={CHECKOUT_SESSION_ID}`,
    });

    return { checkoutToken: session.client_secret! };
  }

  async createBillingPortalSession(params: {
    customerId: string;
    returnUrl: string;
  }): Promise<{ url: string }> {
    const session = await this.stripe.billingPortal.sessions.create({
      customer: params.customerId,
      return_url: params.returnUrl,
    });

    return { url: session.url };
  }

  async cancelSubscription(params: {
    subscriptionId: string;
    invoiceNow?: boolean;
  }): Promise<void> {
    await this.stripe.subscriptions.cancel(params.subscriptionId, {
      invoice_now: params.invoiceNow,
    });
  }

  async retrieveSubscription(subscriptionId: string): Promise<Subscription> {
    const subscription =
      await this.stripe.subscriptions.retrieve(subscriptionId);

    return mapStripeSubscription(subscription);
  }

  async updateSubscription(params: {
    subscriptionId: string;
    lineItemId: string;
    quantity: number;
  }): Promise<Subscription> {
    const subscription = await this.stripe.subscriptions.update(
      params.subscriptionId,
      { items: [{ id: params.lineItemId, quantity: params.quantity }] },
    );

    return mapStripeSubscription(subscription);
  }

  async getCheckoutSession(sessionId: string): Promise<CheckoutSessionStatus> {
    const session = await this.stripe.checkout.sessions.retrieve(sessionId);

    return {
      status: session.status ?? 'open',
      customerId: optionalId(session.customer),
      subscriptionId: optionalId(session.subscription),
    };
  }
}

function optionalId(value: string | { id: string } | null): string | undefined {
  if (value === null) {
    return undefined;
  }

  return typeof value === 'string' ? value : value.id;
}
