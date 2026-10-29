import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { provisionAccount, seedDeal, type IntegrationAccount } from '../../test-support/integration-harness';
import { fakeAiProvider, openAiReply } from '../../test-support/fake-ai-provider';
import { CapReached } from './caps';
import { completeMetered, meterTeamAiCall, resolveTeamAi } from './teamAiKey';

let team: IntegrationAccount;
let unconnected: IntegrationAccount;
let dealId: string;

beforeAll(async () => {
  [team, unconnected] = await Promise.all([provisionAccount(), provisionAccount()]);
  await team.user
    .rpc('save_llm_endpoint', {
      p_account_id: team.accountId,
      p_provider: 'openai_compatible',
      p_model: 'team-chat',
      p_base_url: 'https://provider.example.com/v1',
      p_api_key: 'sk-vault',
      p_embedding_model: 'team-embed',
    })
    .throwOnError();
  await team.admin
    .from('outreach_setting')
    .insert({ account_id: team.accountId, daily_cap: 10, ai_monthly_cap: 100 })
    .throwOnError();
  await team.admin
    .from('contact')
    .insert({ account_id: team.accountId, name: 'Priya Okafor' })
    .throwOnError();
  dealId = await seedDeal(team.admin, team.accountId, team.userId, { description: 'Acme Plumbing' });
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
    .select('model, deal_id, prompt_tokens, completion_tokens')
    .eq('account_id', team.accountId)
    .order('created_at')
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
    expect(await resolveTeamAi(team.accountId, 'embedding')).toMatchObject({ model: 'team-embed' });
  });

  it('resolves nothing for a team without a provider', async () => {
    expect(await resolveTeamAi(unconnected.accountId, 'chat')).toBeNull();
  });

  it('resolves nothing for a model the team has not set', async () => {
    await team.admin.from('llm_endpoint').update({ model: null }).eq('account_id', team.accountId).throwOnError();

    expect(await resolveTeamAi(team.accountId, 'embedding')).toBeNull();
  });

  it('logs a metered call with its deal and tokens', async () => {
    const ai = (await resolveTeamAi(team.accountId, 'chat'))!;

    const answer = await meterTeamAiCall(ai, { dealId }, async () => ({
      result: 'done',
      promptTokens: 9,
      completionTokens: 3,
    }));

    expect(answer).toBe('done');
    expect(await calls()).toEqual([
      { model: 'team-chat', deal_id: dealId, prompt_tokens: 9, completion_tokens: 3 },
    ]);
  });

  it("completes a metered call with the prompt unchanged, team people included", async () => {
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
      });
    } finally {
      provider.close();
      delete process.env.ODB_ALLOW_PRIVATE_AI_URL;
      delete process.env.ODB_STACK;
    }
  });

  it('refuses a call past the monthly AI cap without making it', async () => {
    const ai = (await resolveTeamAi(team.accountId, 'chat'))!;
    await team.admin
      .from('outreach_setting')
      .update({ ai_monthly_cap: (await calls())!.length })
      .eq('account_id', team.accountId)
      .throwOnError();
    let made = false;

    await expect(
      meterTeamAiCall(ai, {}, async () => {
        made = true;
        return { result: null, promptTokens: null, completionTokens: null };
      }),
    ).rejects.toBeInstanceOf(CapReached);
    expect(made).toBe(false);
  });
});
