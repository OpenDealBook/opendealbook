import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  fakeAiProvider,
  openAiReply,
} from '../../test-support/fake-ai-provider';
import {
  provisionAccount,
  seedDeal,
  type IntegrationAccount,
} from '../../test-support/integration-harness';
import { CapReached } from './caps';
import type { Usage } from './modelPrices';
import { completeMetered, meterTeamAiCall, resolveTeamAi } from './teamAiKey';

const TEAM_INPUT = 2;
const TEAM_OUTPUT = 4;

let team: IntegrationAccount;
let unconnected: IntegrationAccount;
let dealId: string;

beforeAll(async () => {
  [team, unconnected] = await Promise.all([
    provisionAccount(),
    provisionAccount(),
  ]);
  await team.user
    .rpc('save_llm_endpoint', {
      p_account_id: team.accountId,
      p_provider: 'openai_compatible',
      p_model: 'team-chat',
      p_base_url: 'https://provider.example.com/v1',
      p_api_key: 'sk-vault',
      p_embedding_model: 'team-embed',
      p_input_price_per_mtok: TEAM_INPUT,
      p_cached_input_price_per_mtok: 1,
      p_output_price_per_mtok: TEAM_OUTPUT,
    })
    .throwOnError();
  await team.admin
    .from('outreach_setting')
    .insert({
      account_id: team.accountId,
      daily_cap: 10,
      ai_monthly_credit_cap: 10000,
    })
    .throwOnError();
  await team.admin
    .from('contact')
    .insert({ account_id: team.accountId, name: 'Priya Okafor' })
    .throwOnError();
  dealId = await seedDeal(team.admin, team.accountId, team.userId, {
    description: 'Acme Plumbing',
  });
});

afterAll(async () => {
  await Promise.all([
    team.admin.from('accounts').delete().eq('id', team.accountId),
    unconnected.admin.from('accounts').delete().eq('id', unconnected.accountId),
  ]);
  await Promise.all([team.cleanup(), unconnected.cleanup()]);
});

async function calls() {
  const { data } = await team.admin
    .from('ai_call_log')
    .select(
      'model, deal_id, prompt_tokens, completion_tokens, credits, settled_at',
    )
    .eq('account_id', team.accountId)
    .order('created_at')
    .throwOnError();
  return data;
}

function usage(tokens: Partial<Usage>): Usage {
  return {
    inputTokens: 0,
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
    ...tokens,
  };
}

async function setCreditCap(credits: number) {
  await team.admin
    .from('outreach_setting')
    .update({ ai_monthly_credit_cap: credits })
    .eq('account_id', team.accountId)
    .throwOnError();
}

async function creditsUsed() {
  const { data } = await team.admin
    .rpc('ai_credits_used_this_month', { p_account_id: team.accountId })
    .throwOnError();
  return data;
}

describe('team AI key', () => {
  it("resolves the team's vault key and chat model", async () => {
    const ai = await resolveTeamAi(team.accountId, 'chat');

    expect(ai).toMatchObject({
      accountId: team.accountId,
      provider: 'openai_compatible',
      apiKey: 'sk-vault',
      model: 'team-chat',
      baseUrl: 'https://provider.example.com/v1',
    });
  });

  it("resolves the team's embedding model", async () => {
    expect(await resolveTeamAi(team.accountId, 'embedding')).toMatchObject({
      model: 'team-embed',
    });
  });

  it('resolves nothing for a team without a provider', async () => {
    expect(await resolveTeamAi(unconnected.accountId, 'chat')).toBeNull();
  });

  it('resolves nothing for a model the team has not set', async () => {
    await team.admin
      .from('llm_endpoint')
      .update({ model: null })
      .eq('account_id', team.accountId)
      .throwOnError();

    expect(await resolveTeamAi(team.accountId, 'embedding')).toBeNull();
  });

  it('holds the worst-case estimate while the call runs, then settles the row to its actual cost', async () => {
    const ai = (await resolveTeamAi(team.accountId, 'chat'))!;
    let held: Awaited<ReturnType<typeof calls>> = [];

    const answer = await meterTeamAiCall(
      ai,
      { dealId },
      usage({ inputTokens: 100, outputTokens: 1000 }),
      async () => {
        held = await calls();
        return {
          result: 'done',
          usage: usage({ inputTokens: 9, outputTokens: 3 }),
        };
      },
    );

    expect(answer).toBe('done');
    expect(held).toEqual([
      expect.objectContaining({
        credits: (100 * TEAM_INPUT + 1000 * TEAM_OUTPUT) / 1e4,
        settled_at: null,
      }),
    ]);
    expect(await calls()).toEqual([
      {
        model: 'team-chat',
        deal_id: dealId,
        prompt_tokens: 9,
        completion_tokens: 3,
        credits: (9 * TEAM_INPUT + 3 * TEAM_OUTPUT) / 1e4,
        settled_at: expect.any(String),
      },
    ]);
  });

  it('settles a call the provider failed to 0 credits and passes the failure on', async () => {
    const ai = (await resolveTeamAi(team.accountId, 'chat'))!;
    const before = await creditsUsed();

    await expect(
      meterTeamAiCall(ai, {}, usage({ outputTokens: 1000 }), async () => {
        throw new Error('The AI provider answered 503');
      }),
    ).rejects.toThrow('The AI provider answered 503');

    expect((await calls())!.at(-1)).toMatchObject({
      credits: 0,
      prompt_tokens: null,
      completion_tokens: null,
      settled_at: expect.any(String),
    });
    expect(await creditsUsed()).toBe(before);
  });

  it('completes a metered call with the prompt unchanged, team people included', async () => {
    const provider = await fakeAiProvider(openAiReply('An answer.'));
    await team.admin
      .from('llm_endpoint')
      .update({ base_url: provider.baseUrl })
      .eq('account_id', team.accountId)
      .throwOnError();
    process.env.ODB_ALLOW_PRIVATE_AI_URL = '1';
    process.env.ODB_STACK = 'local';

    try {
      const ai = (await resolveTeamAi(team.accountId, 'chat'))!;
      const text = await completeMetered(
        ai,
        { dealId },
        'What did Priya Okafor say?',
        { system: 'Be brief' },
      );

      expect(text).toBe('An answer.');
      expect(provider.received[0]!.body.messages).toEqual([
        { role: 'system', content: 'Be brief' },
        { role: 'user', content: 'What did Priya Okafor say?' },
      ]);
      expect((await calls())!.at(-1)).toEqual({
        model: 'team-chat',
        deal_id: dealId,
        prompt_tokens: 12,
        completion_tokens: 5,
        credits: (12 * TEAM_INPUT + 5 * TEAM_OUTPUT) / 1e4,
        settled_at: expect.any(String),
      });
    } finally {
      provider.close();
      delete process.env.ODB_ALLOW_PRIVATE_AI_URL;
      delete process.env.ODB_STACK;
    }
  });

  it('refuses a call whose estimate does not fit what is left, without making it, until next UTC month', async () => {
    const ai = (await resolveTeamAi(team.accountId, 'chat'))!;
    const estimate = usage({ outputTokens: 1000 });
    const estimatedCredits = (1000 * TEAM_OUTPUT) / 1e4;
    await setCreditCap(
      Math.ceil((await creditsUsed())! + estimatedCredits) - 1,
    );
    let made = false;

    const refusal = await meterTeamAiCall(ai, {}, estimate, async () => {
      made = true;
      return { result: null, usage: estimate };
    }).catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(CapReached);
    expect((refusal as CapReached).message).toBe(
      'Not enough AI credits left this month',
    );
    const now = new Date();
    expect((refusal as CapReached).resumeAt).toEqual(
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
    );
    expect(made).toBe(false);
    await setCreditCap(10000);
  });

  it('makes a call to a model with no known price at no cost, even past the cap', async () => {
    await team.admin
      .from('llm_endpoint')
      .update({
        input_price_per_mtok: null,
        cached_input_price_per_mtok: null,
        output_price_per_mtok: null,
      })
      .eq('account_id', team.accountId)
      .throwOnError();
    await setCreditCap(0);
    const ai = (await resolveTeamAi(team.accountId, 'chat'))!;

    const answer = await meterTeamAiCall(
      ai,
      {},
      usage({ outputTokens: 1000 }),
      async () => ({
        result: 'free',
        usage: usage({ inputTokens: 1000, outputTokens: 1000 }),
      }),
    );

    expect(answer).toBe('free');
    expect((await calls())!.at(-1)).toMatchObject({
      credits: 0,
      prompt_tokens: 1000,
      completion_tokens: 1000,
    });
  });
});
