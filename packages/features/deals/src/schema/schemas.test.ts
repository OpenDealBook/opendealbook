import { describe, expect, it } from 'vitest';

import { dealSchema } from './deal.schema';

const account_id = '11111111-1111-4111-8111-111111111111';

describe('dealSchema intake rule', () => {
  it('accepts an intake with a firm name and no description', () => {
    expect(
      dealSchema.safeParse({ account_id, name: 'Acme Plumbing' }).success,
    ).toBe(true);
  });

  it('accepts an intake with a description and no name', () => {
    expect(
      dealSchema.safeParse({ account_id, description: 'HVAC roll-up target' })
        .success,
    ).toBe(true);
  });

  it('rejects an intake with neither a name nor a description', () => {
    expect(dealSchema.safeParse({ account_id }).success).toBe(false);
  });
});
