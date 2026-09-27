import type { BillingStrategy } from './billing-strategy';

export function createBillingGatewayService(strategy: BillingStrategy) {
  return {
    createCheckoutSession: strategy.createCheckoutSession.bind(strategy),
    createBillingPortalSession:
      strategy.createBillingPortalSession.bind(strategy),
    cancelSubscription: strategy.cancelSubscription.bind(strategy),
    retrieveSubscription: strategy.retrieveSubscription.bind(strategy),
    updateSubscription: strategy.updateSubscription.bind(strategy),
    getCheckoutSession: strategy.getCheckoutSession.bind(strategy),
  };
}
