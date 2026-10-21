import { beforeEach, describe, expect, it, vi } from 'vitest';

const seedSampleDeals = vi.hoisted(() => vi.fn(async () => {}));
const membership = vi.hoisted(() => ({
  isOwner: false,
  error: null as Error | null,
}));

const NOT_LOADED = "Example deals couldn't be loaded. Reload them from Settings.";

vi.mock('@odb/seed', () => ({
  seedSampleDeals,
  SampleDealsNotLoaded: class extends Error {
    constructor() {
      super(NOT_LOADED);
    }
  },
}));
vi.mock('@odb/next/actions', () => ({
  enhanceAction:
    (fn: (input: unknown, user: { id: string }) => Promise<unknown>) =>
    (input: unknown) =>
      fn(input, { id: 'user-1' }),
}));
vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({
    rpc: (name: string, args: { account_id: string }) => {
      const result = {
        data:
          name === 'is_account_owner' &&
          args.account_id === 'team-1' &&
          membership.isOwner,
        error: membership.error,
      };

      return {
        then: (resolve: (value: typeof result) => unknown) => resolve(result),
        throwOnError: async () => {
          if (result.error) {
            throw result.error;
          }
          return result;
        },
      };
    },
  }),
}));

const { reloadSampleData } = await import('./trial-actions');
const { SampleDealsNotLoaded } = await import('@odb/seed');

beforeEach(() => {
  seedSampleDeals.mockReset();
  membership.error = null;
});

describe('reloadSampleData', () => {
  it('seeds sample deals for the owner of the account', async () => {
    membership.isOwner = true;

    expect(await reloadSampleData({ accountId: 'team-1' })).toEqual({
      ok: true,
      value: undefined,
    });
    expect(seedSampleDeals).toHaveBeenCalledWith({
      accountId: 'team-1',
      userId: 'user-1',
    });
  });

  it('refuses anyone who is not the owner of the account', async () => {
    membership.isOwner = false;

    expect(await reloadSampleData({ accountId: 'team-1' })).toEqual({
      ok: false,
      refusal: 'Only the team owner can reload sample deals.',
    });
    expect(seedSampleDeals).not.toHaveBeenCalled();
  });

  it('tells the owner to try the reload again when the examples could not be loaded', async () => {
    membership.isOwner = true;
    seedSampleDeals.mockRejectedValueOnce(new SampleDealsNotLoaded());

    expect(await reloadSampleData({ accountId: 'team-1' })).toEqual({
      ok: false,
      refusal: "Example deals couldn't be loaded. Try again.",
    });
  });

  it('fails with the database error instead of refusing when the membership check errors', async () => {
    membership.isOwner = true;
    membership.error = new Error('membership lookup failed');

    await expect(reloadSampleData({ accountId: 'team-1' })).rejects.toThrow(
      'membership lookup failed',
    );
    expect(seedSampleDeals).not.toHaveBeenCalled();
  });
});
