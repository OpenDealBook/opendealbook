import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeAiProvider, openAiReply } from '../../test-support/fake-ai-provider';
import type { TeamAi } from '../builder/teamAiKey';
import { extractFigure } from './extraction';

const ledger = vi.hoisted(() => ({
  reserved: [] as Record<string, unknown>[],
  usage: [] as Record<string, unknown>[],
}));

vi.mock('@odb/supabase/admin', () => {
  const settled = (data: unknown) => ({ throwOnError: async () => ({ data, error: null }) });
  return {
    getSupabaseServerAdminClient: () => ({
      rpc: (_name: string, args: Record<string, unknown>) => {
        ledger.reserved.push(args);
        return settled('call-1');
      },
      from: () => ({
        update: (row: Record<string, unknown>) => ({
          eq: () => {
            ledger.usage.push(row);
            return settled(null);
          },
        }),
      }),
    }),
  };
});

let provider: Awaited<ReturnType<typeof fakeAiProvider>>;

async function serve(reply: { status: number; body: unknown }, kind: TeamAi['provider'] = 'openai'): Promise<TeamAi> {
  provider = await fakeAiProvider(reply);
  return {
    accountId: 'acct1',
    endpointId: 'ep1',
    provider: kind,
    model: 'gpt-4o-mini',
    baseUrl: provider.baseUrl,
    apiKey: 'sk-vault',
  } as TeamAi;
}

beforeEach(() => {
  ledger.reserved = [];
  ledger.usage = [];
  process.env.ODB_ALLOW_PRIVATE_AI_URL = '1';
  process.env.ODB_STACK = 'local';
});

afterEach(() => {
  provider.close();
  delete process.env.ODB_ALLOW_PRIVATE_AI_URL;
  delete process.env.ODB_STACK;
});

describe('extractFigure', () => {
  it('asks for JSON at temperature 0 with the document unchanged, and parses the amount', async () => {
    const ai = await serve(openAiReply('{"amount": 1234}'));

    expect(await extractFigure(ai, 'deal1', 'pull the wages', 'Employee Priya Okafor')).toBe(1234);
    expect(provider.received[0]!.body).toMatchObject({
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 256,
      response_format: { type: 'json_object' },
    });
    expect(provider.received[0]!.body.messages[1]!.content).toBe('pull the wages\n\nDocument:\n\nEmployee Priya Okafor');
  });

  it('counts the call against the AI cap, logged to the deal with its tokens', async () => {
    const ai = await serve(openAiReply('{"amount": 1234}'));

    await extractFigure(ai, 'deal1', 'pull the wages', '# W-2');

    expect(ledger.reserved).toEqual([
      expect.objectContaining({ p_account_id: 'acct1', p_model: 'gpt-4o-mini', p_endpoint_id: 'ep1', p_deal_id: 'deal1' }),
    ]);
    expect(ledger.usage).toEqual([{ prompt_tokens: 12, completion_tokens: 5 }]);
  });

  it('returns a null amount when the model reports the figure is absent', async () => {
    const ai = await serve(openAiReply('{"amount": null}'));

    expect(await extractFigure(ai, 'deal1', 'pull the wages', '# blank')).toBeNull();
  });

  it("reads an Anthropic team's fenced JSON from its messages API", async () => {
    const ai = await serve(
      {
        status: 200,
        body: { content: [{ type: 'text', text: '```json\n{"amount": 98000}\n```' }], usage: { input_tokens: 30, output_tokens: 4 } },
      },
      'anthropic',
    );

    expect(await extractFigure(ai, 'deal1', 'pull the wages', '# 941')).toBe(98000);
    expect(provider.received[0]!.path).toBe('/v1/messages');
  });

  it('refuses a private provider address unless private AI URLs are allowed', async () => {
    const ai = await serve(openAiReply('{"amount": 1}'));
    delete process.env.ODB_ALLOW_PRIVATE_AI_URL;
    delete process.env.ODB_STACK;

    await expect(extractFigure(ai, 'deal1', 'pull the wages', '# W-2')).rejects.toThrow('Use a public HTTPS base URL');
    expect(provider.received).toEqual([]);
  });
});
