import { afterEach, describe, expect, it, vi } from 'vitest';

import { stubBootEnv } from '../../../../test-env';

const NOT_LOADED = "Example deals couldn't be loaded. Reload them from Settings.";

const seedSampleDealsOnce = vi.hoisted(() => vi.fn(async () => {}));

vi.mock('@odb/seed', () => ({
  SAMPLE_DEALS_NOT_LOADED: NOT_LOADED,
  seedSampleDealsOnce,
}));
vi.mock('@odb/shared/logger', () => ({ getLogger: () => ({ error() {} }) }));

async function ensureWithBilling(value: 'false' | undefined) {
  stubBootEnv({ ENABLE_BILLING: value });
  const { ensureSampleDeals } = await import('./ensure-trial-sample-data');

  return ensureSampleDeals({ accountId: 'acc-1', userId: 'user-1' });
}

afterEach(() => {
  vi.unstubAllEnvs();
  seedSampleDealsOnce.mockReset();
});

describe('ensureSampleDeals', () => {
  it.each([undefined, 'false' as const])(
    'seeds the team once whether billing is on or off (ENABLE_BILLING=%s)',
    async (billing) => {
      expect(await ensureWithBilling(billing)).toBeNull();
      expect(seedSampleDealsOnce).toHaveBeenCalledWith({
        accountId: 'acc-1',
        userId: 'user-1',
      });
    },
  );

  it('tells the team the examples could not be loaded instead of failing the page', async () => {
    seedSampleDealsOnce.mockRejectedValueOnce(new Error(NOT_LOADED));

    expect(await ensureWithBilling(undefined)).toBe(NOT_LOADED);
  });

  it('tells the team the same when the seed itself fails', async () => {
    seedSampleDealsOnce.mockRejectedValueOnce(new Error('database down'));

    expect(await ensureWithBilling(undefined)).toBe(NOT_LOADED);
  });
});
