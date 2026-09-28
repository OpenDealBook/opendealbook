import { createBillingConfig } from '@odb/billing';

export const billingConfig = createBillingConfig({
  provider: 'stripe',
  products: [
    {
      id: 'open-deal-book',
      name: 'Open Deal Book',
      description: 'Track, manage, and close every deal in one place.',
      currency: 'USD',
      features: ['Unlimited deals', 'Team collaboration', 'Priority support'],
      plans: [
        {
          id: 'open-deal-book-monthly',
          name: 'Open Deal Book Monthly',
          interval: 'month',
          lineItems: [
            {
              id: 'price_odb_monthly',
              name: 'Base',
              cost: 99,
              type: 'flat',
            },
          ],
        },
        {
          id: 'open-deal-book-yearly',
          name: 'Open Deal Book Yearly',
          interval: 'year',
          lineItems: [
            {
              id: 'price_odb_yearly',
              name: 'Base',
              cost: 990,
              type: 'flat',
            },
          ],
        },
      ],
    },
  ],
});

export default billingConfig;
