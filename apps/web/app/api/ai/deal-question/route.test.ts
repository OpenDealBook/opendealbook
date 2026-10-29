import { beforeEach, describe, expect, it, vi } from 'vitest';

const world = vi.hoisted(() => ({
  lockedAccounts: new Set<string>(),
  mayWork: true,
  answerDealQuestion: vi.fn(async (): Promise<unknown> => ({ answer: 'Revenue grew 12%' })),
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
    rpc: (name: string, args: { target_account_id: string }) =>
      query(
        name === 'has_deal_permission'
          ? world.mayWork
          : world.lockedAccounts.has(args.target_account_id),
      ),
  }),
  requireUser: async () => ({ data: { id: 'user-1' } }),
}));

vi.mock('@odb/ai/server', () => ({
  answerDealQuestion: world.answerDealQuestion,
}));

import { CapReached, TeamAiNotConnected } from '@odb/workflows/team-ai';

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
    world.mayWork = true;
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

  it("refuses a deal the asker can't see as not found, without asking the model", async () => {
    const response = await ask('deal-hidden');

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Deal not found' });
    expect(world.answerDealQuestion).not.toHaveBeenCalled();
  });

  it("refuses an asker who can see the deal but can't work it, without asking the model", async () => {
    world.mayWork = false;

    const response = await ask();

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Only the deal team can ask about this deal.' });
    expect(world.answerDealQuestion).not.toHaveBeenCalled();
  });

  it("asks within the deal's verified team", async () => {
    await ask();

    expect(world.answerDealQuestion).toHaveBeenCalledWith(
      expect.anything(),
      { accountId: 'team-1', dealId: 'deal-1' },
      { question: 'How is revenue?' },
    );
  });

  it.each([
    [new TeamAiNotConnected(), 409, 'Connect an AI provider first'],
    [new CapReached(), 429, 'The monthly AI limit is reached'],
  ])('tells the asker why the team cannot answer: %s', async (refusal, status, error) => {
    world.answerDealQuestion.mockRejectedValueOnce(refusal);

    const response = await ask();

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error });
  });
});
