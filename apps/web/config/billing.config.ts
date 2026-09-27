import { createBillingConfig } from '@tuckin/billing';

export const billingConfig = createBillingConfig({
  provider: 'stripe',
  products: [
    {
      id: 'starter',
      name: 'Starter',
      description: 'Everything you need to get started.',
      currency: 'USD',
      features: ['Unlimited projects', 'Community support'],
      plans: [
        {
          id: 'starter-monthly',
          name: 'Starter Monthly',
          interval: 'month',
          lineItems: [
            {
              id: 'starter-monthly-flat',
              name: 'Base',
              cost: 9,
              type: 'flat',
            },
          ],
        },
        {
          id: 'starter-yearly',
          name: 'Starter Yearly',
          interval: 'year',
          lineItems: [
            {
              id: 'starter-yearly-flat',
              name: 'Base',
              cost: 90,
              type: 'flat',
            },
          ],
        },
      ],
    },
  ],
});

export default billingConfig;
