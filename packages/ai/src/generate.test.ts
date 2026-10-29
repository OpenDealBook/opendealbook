import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CapReached } from '@odb/workflows/team-ai';

import { fakeAiProvider } from '../../workflows/test-support/fake-ai-provider';
import { fakeTeam, type FakeTeam } from '../test-support/fake-team-ai';
import { answerDealQuestion } from './generate';
import type { DealAiScope } from './scope';

const scope = { accountId: 'acct-1', dealId: 'deal-1' } as DealAiScope;

const EMBEDDING = Array.from({ length: 1536 }, () => 0.01);

const world = vi.hoisted(() => ({ team: null as unknown }));

vi.mock('@odb/supabase/admin', async () => {
  const { fakeAdminClient } = await import('../test-support/fake-team-ai');
  return { getSupabaseServerAdminClient: () => fakeAdminClient(world.team as FakeTeam) };
});

function makeReadClient(chunks: unknown[]) {
  const rpc = vi.fn(() => Promise.resolve({ data: chunks, error: null }));

  return { rpc } as unknown as Parameters<typeof answerDealQuestion>[0] & { rpc: typeof rpc };
}

function answer({ path }: { path: string }) {
  if (path.endsWith('/embeddings')) {
    return { data: [{ index: 0, embedding: EMBEDDING }], usage: { prompt_tokens: 6 } };
  }
  if (path.endsWith('/messages')) {
    return { content: [{ type: 'text', text: 'Revenue grew 12% in FY23.' }], usage: { input_tokens: 300, output_tokens: 40 } };
  }
  return {
    choices: [{ message: { content: 'Revenue grew 12% in FY23.' } }],
    usage: { prompt_tokens: 321, completion_tokens: 42 },
  };
}

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

function ask(chunks: unknown[] = []) {
  return answerDealQuestion(makeReadClient(chunks), scope, { question: 'Did Priya Okafor report revenue?' });
}

describe('answerDealQuestion', () => {
  it("embeds the question and answers from deal chunks on the team's vault key, team people included unchanged", async () => {
    const read = makeReadClient([
      { id: 'chunk-a', content: 'FY23 revenue was 4.2M per Priya Okafor.', distance: 0.1 },
      { id: 'chunk-b', content: 'Marketing spend rose in Q4.', distance: 0.2 },
    ]);

    const result = await answerDealQuestion(read, scope, { question: 'Did Priya Okafor report revenue?' });

    const [embedding, chat] = provider.received;
    expect(embedding).toMatchObject({
      path: '/v1/embeddings',
      headers: { authorization: 'Bearer sk-vault' },
      body: { model: 'text-embedding-3-small', input: ['Did Priya Okafor report revenue?'] },
    });
    expect(read.rpc).toHaveBeenCalledWith('match_document_chunks', {
      p_deal_id: 'deal-1',
      p_embedding: JSON.stringify(EMBEDDING),
      p_match_count: 8,
    });
    expect(chat).toMatchObject({
      path: '/v1/chat/completions',
      headers: { authorization: 'Bearer sk-vault' },
      body: { model: 'gpt-4o-mini' },
    });
    expect(chat!.body.messages[0]!.role).toBe('system');
    expect(chat!.body.messages[1]!.content).toContain('FY23 revenue was 4.2M per Priya Okafor.');
    expect(chat!.body.messages[1]!.content).toContain('Did Priya Okafor report revenue?');
    expect(result).toEqual({
      answer: 'Revenue grew 12% in FY23.',
      citations: [{ chunkId: 'chunk-a' }, { chunkId: 'chunk-b' }],
    });
  });

  it('answers with the low temperature and token limit Q&A uses', async () => {
    await ask();

    expect(provider.received[1]!.body).toMatchObject({ temperature: 0.1, max_tokens: 1024 });
  });

  it('refuses an Anthropic team without calling a provider, since Anthropic has no embeddings', async () => {
    team.endpoint.provider = 'anthropic';

    await expect(ask()).rejects.toThrow(
      'Anthropic has no embeddings API; use an OpenAI-compatible provider for document search',
    );
    expect(provider.received).toEqual([]);
    expect(team.reserved).toEqual([]);
  });

  it('counts the embedding and the answer against the AI cap, logged to the deal', async () => {
    await ask();

    expect(team.reserved).toEqual([
      expect.objectContaining({ p_account_id: 'acct-1', p_model: 'text-embedding-3-small', p_endpoint_id: 'endpoint-1', p_deal_id: 'deal-1' }),
      expect.objectContaining({ p_account_id: 'acct-1', p_model: 'gpt-4o-mini', p_endpoint_id: 'endpoint-1', p_deal_id: 'deal-1' }),
    ]);
    expect(team.usage).toEqual([
      { id: 'call-1', prompt_tokens: null, completion_tokens: null },
      { id: 'call-2', prompt_tokens: 321, completion_tokens: 42 },
    ]);
  });

  it('refuses a private provider address unless private AI URLs are allowed', async () => {
    delete process.env.ODB_ALLOW_PRIVATE_AI_URL;
    delete process.env.ODB_STACK;

    await expect(ask()).rejects.toThrow('Use a public HTTPS base URL');
    expect(provider.received).toEqual([]);
  });

  it('refuses without calling a provider when the team has no key', async () => {
    team.apiKey = null;

    await expect(ask()).rejects.toThrow('Connect an AI provider first');
    expect(provider.received).toEqual([]);
  });

  it('refuses without calling a provider when the team has no embedding model', async () => {
    team.endpoint.model = null;

    await expect(ask()).rejects.toThrow('Add an embedding model to your AI provider');
    expect(provider.received).toEqual([]);
  });

  it('refuses without calling a provider once the AI cap is reached', async () => {
    team.capReached = true;

    await expect(ask()).rejects.toBeInstanceOf(CapReached);
    expect(provider.received).toEqual([]);
  });
});
