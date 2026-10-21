import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { fakeAiProvider, openAiReply } from '../../../test-support/fake-ai-provider';
import { provisionAccount, type IntegrationAccount } from '../../../test-support/integration-harness';
import { decisionModel } from './decisionModel';

const network = vi.hoisted(() => ({ trustedFakeUrl: '' }));

vi.mock('../publicUrl', () => ({
  publicAddressOf: async (url: string) =>
    url.startsWith(network.trustedFakeUrl) ? { address: '127.0.0.1', family: 4 } : null,
}));

let owner: IntegrationAccount;
let outsider: IntegrationAccount;
let provider: Awaited<ReturnType<typeof fakeAiProvider>>;
let firmId: string;
let outsiderFirmId: string;

async function seedFirm(account: IntegrationAccount) {
  const { data } = await account.admin
    .from('firm')
    .insert({
      account_id: account.accountId,
      name: 'Harbor HVAC',
      industry: 'HVAC',
      owner_names: ['Walter Brennan-Fisk'],
    })
    .select('id')
    .single()
    .throwOnError();
  return data.id as string;
}

beforeAll(async () => {
  [owner, outsider] = await Promise.all([provisionAccount(), provisionAccount()]);
  provider = await fakeAiProvider(openAiReply('unused'));
  await owner.admin
    .from('outreach_setting')
    .insert({ account_id: owner.accountId, daily_cap: 10, ai_monthly_cap: 100 })
    .throwOnError();
  await owner.user
    .rpc('save_llm_endpoint', {
      p_account_id: owner.accountId,
      p_provider: 'openai_compatible',
      p_model: 'layla',
      p_base_url: 'https://provider.example.com/v1',
      p_api_key: 'sk-team',
    })
    .throwOnError();
  network.trustedFakeUrl = provider.baseUrl;
  await owner.admin
    .from('llm_endpoint')
    .update({ base_url: provider.baseUrl })
    .eq('account_id', owner.accountId)
    .throwOnError();
  [firmId, outsiderFirmId] = await Promise.all([seedFirm(owner), seedFirm(outsider)]);
  await owner.admin
    .from('deal_box')
    .insert({ account_id: owner.accountId, version: 1, criteria_json: { industries: ['plumbing'] } })
    .throwOnError();
  await owner.admin
    .from('decision_fact')
    .insert({ account_id: owner.accountId, body: 'We never buy franchises' })
    .throwOnError();
});

afterAll(async () => {
  provider.close();
  await owner.admin.from('accounts').delete().in('id', [owner.accountId, outsider.accountId]);
  await Promise.all([owner.cleanup(), outsider.cleanup()]);
});

function decide(idempotencyKey: string, config: Record<string, unknown>) {
  return decisionModel.execute({
    context: { accountId: owner.accountId, runId: 'run-1', idempotencyKey },
    config,
    input: {},
  });
}

describe('decision_model step (integration)', () => {
  it("asks the team's AI with its deal box and facts, then appends the verdict", async () => {
    provider.reply.body = openAiReply('{"fit": false, "reasons": ["HVAC is outside the deal box"]}').body;
    provider.received.length = 0;

    const output = await decide('run-1:fit:0', { firmId, instructions: 'Be strict.' });

    const { data: verdicts } = await owner.admin
      .from('firm_verdict')
      .select('id, fit, reasons, model')
      .eq('firm_id', firmId)
      .throwOnError();
    expect(verdicts).toEqual([
      { id: output.verdictId, fit: false, reasons: ['HVAC is outside the deal box'], model: 'layla' },
    ]);
    expect(output).toMatchObject({ fit: false, reasons: ['HVAC is outside the deal box'] });
    const prompt = provider.received[0]!.body.messages[0]!.content;
    expect(prompt).toContain('plumbing');
    expect(prompt).toContain('We never buy franchises');
    expect(prompt).toContain('Be strict.');
    expect(prompt).toContain('Harbor HVAC');
    expect(prompt).not.toContain('Walter Brennan-Fisk');
  });

  it('returns the recorded verdict without asking again when the step is retried', async () => {
    provider.received.length = 0;
    provider.reply.body = openAiReply('{"fit": true, "reasons": ["changed its mind"]}').body;

    const output = await decide('run-1:fit:0', { firmId });

    expect(output).toMatchObject({ fit: false, reasons: ['HVAC is outside the deal box'] });
    expect(provider.received).toEqual([]);
  });

  it("refuses, without asking the AI, a firm on another team", async () => {
    provider.received.length = 0;

    await expect(decide('run-1:fit:1', { firmId: outsiderFirmId })).rejects.toMatchObject({
      nonRetryable: true,
      message: 'That firm is not on this team',
    });
    expect(provider.received).toEqual([]);
  });

  it('fails at once, appending nothing, when the AI does not answer with a fit and reasons', async () => {
    provider.reply.body = openAiReply('It is probably a fit').body;

    await expect(decide('run-1:fit:2', { firmId })).rejects.toMatchObject({
      nonRetryable: true,
      message: 'The AI did not answer with a fit and reasons',
    });
    const { count } = await owner.admin
      .from('firm_verdict')
      .select('id', { count: 'exact', head: true })
      .eq('firm_id', firmId);
    expect(count).toBe(1);
  });

  it('fails at once, without asking the AI, when the team has no deal box', async () => {
    await owner.admin.from('deal_box').delete().eq('account_id', owner.accountId).throwOnError();
    provider.received.length = 0;

    await expect(decide('run-1:fit:3', { firmId })).rejects.toMatchObject({
      nonRetryable: true,
      message: 'Set your deal box before using the decision model.',
    });
    expect(provider.received).toEqual([]);
  });
});
