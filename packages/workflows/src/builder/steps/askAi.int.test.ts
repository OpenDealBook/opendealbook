import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { fakeAiProvider, openAiReply } from '../../../test-support/fake-ai-provider';
import { provisionAccount, type IntegrationAccount } from '../../../test-support/integration-harness';
import { askAi } from './askAi';

const network = vi.hoisted(() => ({ trustedFakeUrl: '' }));

vi.mock('../publicUrl', async (importOriginal) => {
  const { publicAddressOf } = await importOriginal<typeof import('../publicUrl')>();
  return {
    publicAddressOf: async (url: string) =>
      url.startsWith(network.trustedFakeUrl)
        ? { address: '127.0.0.1', family: 4 }
        : publicAddressOf(url),
  };
});

let owner: IntegrationAccount;
let member: IntegrationAccount;
let provider: Awaited<ReturnType<typeof fakeAiProvider>>;

async function saveEndpoint(apiKey: string) {
  await owner.user
    .rpc('save_llm_endpoint', {
      p_account_id: owner.accountId,
      p_provider: 'openai_compatible',
      p_model: 'team-model',
      p_base_url: 'https://provider.example.com/v1',
      p_api_key: apiKey,
    })
    .throwOnError();
  await pointEndpointAt(provider.baseUrl);
}

async function pointEndpointAt(baseUrl: string) {
  await owner.admin
    .from('llm_endpoint')
    .update({ base_url: baseUrl })
    .eq('account_id', owner.accountId)
    .throwOnError();
}

async function callCount() {
  const { count } = await owner.admin
    .from('ai_call_log')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', owner.accountId);
  return count!;
}

beforeAll(async () => {
  [owner, member] = await Promise.all([provisionAccount(), provisionAccount()]);
  await owner.admin
    .from('accounts_memberships')
    .insert({ account_id: owner.accountId, user_id: member.userId, account_role: 'member' })
    .throwOnError();
  provider = await fakeAiProvider(openAiReply('unused'));
  network.trustedFakeUrl = provider.baseUrl;
  await owner.admin
    .from('outreach_setting')
    .insert({ account_id: owner.accountId, daily_cap: 10, ai_monthly_cap: 100 })
    .throwOnError();
  await saveEndpoint('sk-first');
  await owner.admin
    .from('contact')
    .insert({ account_id: owner.accountId, name: 'Priya Okafor' })
    .throwOnError();
  await owner.admin
    .from('accounts')
    .update({ name: 'Rosa Delgado' })
    .eq('id', member.userId)
    .throwOnError();
});

afterAll(async () => {
  provider.close();
  await owner.admin.from('accounts').delete().eq('id', owner.accountId);
  await Promise.all([owner.cleanup(), member.cleanup()]);
});

function run(idempotencyKey: string, config: Record<string, unknown>, signal?: AbortSignal) {
  return askAi.execute({
    context: { accountId: owner.accountId, runId: 'run-1', idempotencyKey, signal },
    config,
    input: {},
  });
}

describe('ask_ai step (integration)', () => {
  it("sends the prompt to the team's endpoint with people redacted, returns the text and logs the call", async () => {
    provider.reply.body = openAiReply('Three firms look promising.').body;
    provider.received.length = 0;

    const output = await run('run-1:ask:0', {
      prompt: 'Summarise Priya Okafor (priya@okafor.test, 555-201-3344) pipeline for Rosa, cc Delgado',
    });

    expect(output).toEqual({ text: 'Three firms look promising.' });
    expect(provider.received.map((call) => call.body.messages[0]!.content)).toEqual([
      'Summarise [name] ([email], [phone]) pipeline for [name], cc [name]',
    ]);
    const { data: log } = await owner.admin
      .from('ai_call_log')
      .select('model, prompt_tokens, completion_tokens')
      .eq('account_id', owner.accountId)
      .throwOnError();
    expect(log).toEqual([{ model: 'team-model', prompt_tokens: 12, completion_tokens: 5 }]);
  });

  it('saves the settings model as the chat model only, leaving the embedding model unset', async () => {
    const { data: endpoint } = await owner.admin
      .from('llm_endpoint')
      .select('model, chat_model')
      .eq('account_id', owner.accountId)
      .single()
      .throwOnError();

    expect(endpoint).toEqual({ model: null, chat_model: 'team-model' });
  });

  it('returns parsed json when the step asks for json', async () => {
    provider.reply.body = openAiReply('{"score": 7}').body;

    expect(await run('run-1:ask:1', { prompt: 'Score it', output: 'json' })).toEqual({
      json: { score: 7 },
    });
  });

  it('fails at once when the step asks for json and the answer is not json', async () => {
    provider.reply.body = openAiReply('Sure! Here it is: score 7').body;

    await expect(run('run-1:ask:2', { prompt: 'Score it', output: 'json' })).rejects.toMatchObject({
      nonRetryable: true,
      message: 'The AI did not answer with valid JSON',
    });
  });

  it('counts an attempt the provider fails, without its tokens', async () => {
    const before = await callCount();
    provider.reply.status = 503;
    provider.reply.body = { error: 'overloaded' };

    const failure = await run('run-1:ask:3', { prompt: 'Hi' }).catch((error: unknown) => error);

    provider.reply.status = 200;
    expect(failure).toMatchObject({ message: 'The AI provider answered 503' });
    expect(await callCount()).toBe(before + 1);
  });

  it('neither reserves nor calls the provider once the activity is cancelled', async () => {
    const before = await callCount();
    provider.received.length = 0;

    const failure = await run('run-1:ask:9', { prompt: 'Hi' }, AbortSignal.abort()).catch(
      (error: unknown) => error,
    );

    expect(failure).toMatchObject({ name: 'AbortError' });
    expect(await callCount()).toBe(before);
    expect(provider.received).toEqual([]);
  });

  it('refuses at call time, without calling it, an endpoint whose address is not public', async () => {
    await pointEndpointAt('https://127.0.0.1/v1');
    provider.received.length = 0;

    const failure = await run('run-1:ask:4', { prompt: 'Hi' }).catch((error: unknown) => error);

    await pointEndpointAt(provider.baseUrl);
    expect(failure).toMatchObject({ nonRetryable: true, message: 'Use a public HTTPS base URL' });
    expect(provider.received).toEqual([]);
  });

  it('uses a replaced key, and never lets a team member change or read it', async () => {
    const memberSave = await member.user.rpc('save_llm_endpoint', {
      p_account_id: owner.accountId,
      p_provider: 'openai',
      p_model: 'stolen',
      p_base_url: '',
      p_api_key: 'sk-evil',
    });
    const memberRead = await member.user.rpc('llm_endpoint_api_key', { p_account_id: owner.accountId });
    const ownerRead = await owner.user.rpc('llm_endpoint_api_key', { p_account_id: owner.accountId });
    await saveEndpoint('sk-second');
    provider.reply.body = openAiReply('ok').body;
    provider.received.length = 0;

    await run('run-1:ask:5', { prompt: 'Hi' });

    expect(memberSave.error).not.toBeNull();
    expect(memberRead.error).not.toBeNull();
    expect(ownerRead.error).not.toBeNull();
    expect(provider.received.map((call) => call.headers.authorization)).toEqual(['Bearer sk-second']);
  });

  it.each([
    ['has no key', { api_key_secret_id: null }],
    ['has no chat model', { chat_model: null }],
  ])('fails with "Connect an AI provider first" when the endpoint %s', async (_, broken) => {
    const { data: saved } = await owner.admin
      .from('llm_endpoint')
      .select('api_key_secret_id, chat_model')
      .eq('account_id', owner.accountId)
      .single()
      .throwOnError();
    await owner.admin.from('llm_endpoint').update(broken).eq('account_id', owner.accountId).throwOnError();
    provider.received.length = 0;

    const failure = await run('run-1:ask:6', { prompt: 'Hi' }).catch((error: unknown) => error);

    await owner.admin.from('llm_endpoint').update(saved).eq('account_id', owner.accountId).throwOnError();
    expect(failure).toMatchObject({ nonRetryable: true, message: 'Connect an AI provider first' });
    expect(provider.received).toEqual([]);
  });

  it('refuses without calling the provider once the team reaches its monthly AI cap', async () => {
    await owner.admin
      .from('outreach_setting')
      .update({ ai_monthly_cap: await callCount() })
      .eq('account_id', owner.accountId)
      .throwOnError();
    provider.received.length = 0;

    await expect(run('run-1:ask:7', { prompt: 'Hi' })).rejects.toThrow('The monthly AI limit is reached');
    expect(provider.received).toEqual([]);
  });

  it('fails with "Connect an AI provider first" once a settings manager disconnects, which members cannot do', async () => {
    const memberDisconnect = await member.user.rpc('disconnect_llm_endpoint', {
      p_account_id: owner.accountId,
    });
    await owner.user
      .rpc('disconnect_llm_endpoint', { p_account_id: owner.accountId })
      .throwOnError();
    provider.received.length = 0;

    await expect(run('run-1:ask:8', { prompt: 'Hi' })).rejects.toMatchObject({
      nonRetryable: true,
      message: 'Connect an AI provider first',
    });
    expect(memberDisconnect.error).not.toBeNull();
    expect(provider.received).toEqual([]);
  });
});
