import type { Subscription } from '@odb/billing';

export interface CheckoutSessionStatus {
  status: string;
  customerId?: string;
  subscriptionId?: string;
}

export interface BillingStrategy {
  createCheckoutSession(params: {
    accountId: string;
    customerId?: string;
    customerEmail?: string;
    productId: string;
    planId: string;
    returnUrl: string;
    quantity?: number;
  }): Promise<{ checkoutToken: string }>;

  createBillingPortalSession(params: {
    customerId: string;
    returnUrl: string;
  }): Promise<{ url: string }>;

  cancelSubscription(params: {
    subscriptionId: string;
    invoiceNow?: boolean;
  }): Promise<void>;

  retrieveSubscription(subscriptionId: string): Promise<Subscription>;

  updateSubscription(params: {
    subscriptionId: string;
    lineItemId: string;
    quantity: number;
  }): Promise<Subscription>;

  getCheckoutSession(sessionId: string): Promise<CheckoutSessionStatus>;
}

export type BillingWebhookEvent =
  | { type: 'subscription.created'; subscription: Subscription }
  | { type: 'subscription.updated'; subscription: Subscription }
  | { type: 'subscription.deleted'; subscription: Subscription }
  | {
      type: 'checkout.completed';
      sessionId: string;
      customerId?: string;
      subscriptionId?: string;
      accountId?: string;
    };

export interface BillingWebhookHandler {
  handleEvent(
    rawBody: string | Buffer,
    signature: string,
  ): Promise<BillingWebhookEvent>;
}
