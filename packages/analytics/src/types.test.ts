import { describe, expect, it } from 'vitest';

import { analyticsPropertiesSchema } from './types';

describe('analyticsPropertiesSchema', () => {
  it('accepts string, number, boolean, and null values', () => {
    const result = analyticsPropertiesSchema.safeParse({
      plan: 'pro',
      seats: 5,
      trial: false,
      referrer: null,
    });

    expect(result.success).toBe(true);
  });

  it('rejects nested object values', () => {
    const result = analyticsPropertiesSchema.safeParse({
      nested: { deep: true },
    });

    expect(result.success).toBe(false);
  });
});
