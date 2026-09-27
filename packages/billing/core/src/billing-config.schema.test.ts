import { describe, expect, it } from 'vitest';

import { createBillingConfig } from './billing-config.schema';

const validConfig = {
  provider: 'stripe' as const,
  products: [
    {
      id: 'pro',
      name: 'Pro',
      description: 'For growing teams',
      currency: 'usd',
      features: ['Unlimited projects'],
      plans: [
        {
          id: 'pro-monthly',
          name: 'Pro Monthly',
          interval: 'month' as const,
          lineItems: [
            {
              id: 'pro-flat-monthly',
              name: 'Base',
              cost: 10,
              type: 'flat' as const,
            },
            {
              id: 'pro-seat-monthly',
              name: 'Per seat',
              cost: 5,
              type: 'per_seat' as const,
              unit: 'seat',
            },
          ],
        },
        {
          id: 'pro-yearly',
          name: 'Pro Yearly',
          interval: 'year' as const,
          lineItems: [
            {
              id: 'pro-flat-yearly',
              name: 'Base',
              cost: 100,
              type: 'flat' as const,
            },
          ],
        },
      ],
    },
  ],
};

describe('createBillingConfig', () => {
  it('accepts a valid multi-plan config spanning flat and per-seat pricing', () => {
    const config = createBillingConfig(validConfig);

    expect(config.products[0]?.plans).toHaveLength(2);
  });

  it('rejects an invalid interval', () => {
    const config = {
      ...validConfig,
      products: [
        {
          ...validConfig.products[0]!,
          plans: [
            {
              ...validConfig.products[0]!.plans[0]!,
              interval: 'week',
            },
          ],
        },
      ],
    };

    expect(() => createBillingConfig(config as never)).toThrow();
  });

  it('rejects a plan missing its required name', () => {
    const config = {
      ...validConfig,
      products: [
        {
          ...validConfig.products[0]!,
          plans: [
            {
              id: 'pro-monthly',
              interval: 'month' as const,
              lineItems: validConfig.products[0]!.plans[0]!.lineItems,
            },
          ],
        },
      ],
    };

    expect(() => createBillingConfig(config as never)).toThrow();
  });

  it('rejects a per-seat line item without a unit', () => {
    const config = {
      ...validConfig,
      products: [
        {
          ...validConfig.products[0]!,
          plans: [
            {
              id: 'pro-monthly',
              name: 'Pro Monthly',
              interval: 'month' as const,
              lineItems: [
                {
                  id: 'seat',
                  name: 'Per seat',
                  cost: 5,
                  type: 'per_seat' as const,
                },
              ],
            },
          ],
        },
      ],
    };

    expect(() => createBillingConfig(config as never)).toThrow();
  });
});
