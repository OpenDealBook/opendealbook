import { beforeEach, describe, expect, it, vi } from 'vitest';

const world = vi.hoisted(() => ({
  lockedAccounts: new Set<string>(),
  answerDealQuestion: vi.fn(async () => ({ answer: 'Revenue grew 12%' })),
}));

function query(data: unknown) {
  const result = { data, error: null };
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: () => chain,
    single: () => ({
      throwOnError: async () => {
        if (data === null) {
          throw new Error('Cannot coerce the result to a single JSON object');
        }
        return result;
      },
    }),
    throwOnError: async () => result,
    then: (resolve: (value: typeof result) => unknown) => resolve(result),
  };
  return chain;
}

const visibleDeals: Record<string, string> = { 'deal-1': 'team-1' };

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({
    from: () => ({
      select: () => ({
        eq: (_column: string, dealId: string) =>
          query(
            visibleDeals[dealId] ? { account_id: visibleDeals[dealId] } : null,
          ),
      }),
    }),
    rpc: (_name: string, args: { target_account_id: string }) =>
      query(world.lockedAccounts.has(args.target_account_id)),
  }),
  requireUser: async () => ({ data: { id: 'user-1' } }),
}));

vi.mock('@odb/supabase/admin', () => ({
  getSupabaseServerAdminClient: () => ({}),
}));

vi.mock('@odb/ai/server', () => ({
  answerDealQuestion: world.answerDealQuestion,
}));

import { POST } from './route';

function ask(dealId = 'deal-1') {
  return POST(
    new Request('http://localhost/api/ai/deal-question', {
      method: 'POST',
      body: JSON.stringify({ dealId, question: 'How is revenue?' }),
    }),
  );
}

describe('POST /api/ai/deal-question', () => {
  beforeEach(() => {
    world.lockedAccounts.clear();
    world.answerDealQuestion.mockClear();
  });

  it('refuses a locked team before asking the model', async () => {
    world.lockedAccounts.add('team-1');

    const response = await ask();

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: 'This team is read-only until billing is updated.',
    });
    expect(world.answerDealQuestion).not.toHaveBeenCalled();
  });

  it('answers an unlocked team', async () => {
    const response = await ask();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ answer: 'Revenue grew 12%' });
  });

  it('leaves an unknown or invisible deal to the answering path as before', async () => {
    const response = await ask('deal-hidden');

    expect(world.answerDealQuestion).toHaveBeenCalledWith(
      expect.anything(),
      { dealId: 'deal-hidden', question: 'How is revenue?' },
      expect.anything(),
    );
    expect(response.status).toBe(200);
  });
});
