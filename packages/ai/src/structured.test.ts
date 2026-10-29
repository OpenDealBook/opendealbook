import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeAiProvider } from '../../workflows/test-support/fake-ai-provider';
import { fakeTeam, type FakeTeam } from '../test-support/fake-team-ai';
import type { AiScope } from './scope';
import { generateStructured } from './structured';

const world = vi.hoisted(() => ({ team: null as unknown }));

vi.mock('@odb/supabase/admin', async () => {
  const { fakeAdminClient } = await import('../test-support/fake-team-ai');
  return { getSupabaseServerAdminClient: () => fakeAdminClient(world.team as FakeTeam) };
});

function answer({ path }: { path: string }) {
  return path.endsWith('/messages')
    ? { content: [{ type: 'text', text: '```json\n{"foo":"baz","n":4}\n```' }], usage: { input_tokens: 60, output_tokens: 8 } }
    : { choices: [{ message: { content: '{"foo":"bar","n":3}' } }], usage: { prompt_tokens: 50, completion_tokens: 7 } };
}

const input = {
  scope: { accountId: 'acct-1' } as AiScope,
  system: 'system instructions',
  prompt: 'Priya Okafor (priya@okafor.test) runs the shop',
  parse: (raw: unknown) => raw,
};

let team: FakeTeam;
let provider: Awaited<ReturnType<typeof fakeAiProvider>>;

beforeEach(async () => {
  provider = await fakeAiProvider({ status: 200, body: null, answer });
  team = fakeTeam();
  team.endpoint.base_url = provider.baseUrl;
  world.team = team;
  process.env.ODB_ALLOW_PRIVATE_AI_URL = '1';
  process.env.ODB_STACK = 'local';
});

afterEach(() => {
  provider.close();
  delete process.env.ODB_ALLOW_PRIVATE_AI_URL;
  delete process.env.ODB_STACK;
});

describe('generateStructured', () => {
  it("asks the team's chat model on its vault key with the prompt unchanged, and parses the reply", async () => {
    const result = await generateStructured({
      ...input,
      parse: (raw) => {
        const value = raw as { foo: string; n: number };
        return { picked: value.foo, doubled: value.n * 2 };
      },
    });

    expect(provider.received).toMatchObject([
      {
        path: '/v1/chat/completions',
        headers: { authorization: 'Bearer sk-vault' },
        body: {
          model: 'gpt-4o-mini',
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: 'system instructions' },
            { role: 'user', content: 'Priya Okafor (priya@okafor.test) runs the shop' },
          ],
        },
      },
    ]);
    expect(result).toEqual({ ok: true, value: { picked: 'bar', doubled: 6 } });
  });

  it("asks an Anthropic team through Anthropic's messages API and reads JSON it fenced", async () => {
    team.endpoint.provider = 'anthropic';

    expect(await generateStructured(input)).toEqual({ ok: true, value: { foo: 'baz', n: 4 } });
    expect(provider.received).toMatchObject([
      {
        path: '/v1/messages',
        headers: { 'x-api-key': 'sk-vault' },
        body: {
          system: 'system instructions',
          temperature: 0,
          messages: [{ role: 'user', content: 'Priya Okafor (priya@okafor.test) runs the shop' }],
        },
      },
    ]);
  });

  it('counts the call against the AI cap and logs its tokens to the deal when one is given', async () => {
    await generateStructured({ ...input, scope: { accountId: 'acct-1', dealId: 'deal-1' } as AiScope });

    expect(team.reserved).toEqual([
      expect.objectContaining({ p_account_id: 'acct-1', p_model: 'gpt-4o-mini', p_endpoint_id: 'endpoint-1', p_deal_id: 'deal-1' }),
    ]);
    expect(team.usage).toEqual([{ id: 'call-1', prompt_tokens: 50, completion_tokens: 7 }]);
  });

  it('refuses a private provider address unless private AI URLs are allowed', async () => {
    delete process.env.ODB_ALLOW_PRIVATE_AI_URL;
    delete process.env.ODB_STACK;

    await expect(generateStructured(input)).rejects.toThrow('Use a public HTTPS base URL');
    expect(provider.received).toEqual([]);
  });

  it('skips, saying why, without calling a provider when the team has no key', async () => {
    team.apiKey = null;

    expect(await generateStructured(input)).toEqual({ ok: false, reason: 'Connect an AI provider first' });
    expect(provider.received).toEqual([]);
  });

  it('skips, saying why, without calling a provider once the AI cap is reached', async () => {
    team.capReached = true;

    expect(await generateStructured(input)).toEqual({ ok: false, reason: 'The monthly AI limit is reached' });
    expect(provider.received).toEqual([]);
  });
});
