import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { answerDealQuestion } from './generate';

const KEY_REF = 'TEST_LLM_KEY';
const EMBEDDING = Array.from({ length: 1536 }, () => 0.01);

interface EndpointRow {
  id: string;
  model: string;
  chat_model: string | null;
  base_url: string | null;
  api_key_secret_ref: string | null;
}

function makeReadClient(endpoint: EndpointRow | null, chunks: unknown[]) {
  const rpc = vi.fn(() => Promise.resolve({ data: chunks, error: null }));

  function makeBuilder(table: string) {
    const builder: Record<string, unknown> = {};
    const chain = () => builder;

    builder.select = chain;
    builder.eq = chain;
    builder.limit = chain;
    builder.single = () => {
      if (table === 'deal') {
        return Promise.resolve({ data: { account_id: 'acct-1' }, error: null });
      }

      return Promise.resolve({
        data: endpoint,
        error: endpoint ? null : { message: 'no endpoint' },
      });
    };

    return builder;
  }

  return {
    from: vi.fn((table: string) => makeBuilder(table)),
    rpc,
  } as unknown as Parameters<typeof answerDealQuestion>[0] & {
    rpc: typeof rpc;
    from: ReturnType<typeof vi.fn>;
  };
}

function makeWriteClient() {
  const insert = vi.fn(() => Promise.resolve({ data: null, error: null }));

  return {
    client: {
      from: vi.fn(() => ({ insert })),
    } as unknown as Parameters<typeof answerDealQuestion>[2],
    insert,
  };
}

function mockFetch(chatUsage: Record<string, number> | undefined) {
  return vi.fn((url: string, _init?: RequestInit) => {
    if (url.endsWith('/embeddings')) {
      return Promise.resolve({
        json: () => Promise.resolve({ data: [{ index: 0, embedding: EMBEDDING }] }),
      });
    }

    if (url.endsWith('/chat/completions')) {
      return Promise.resolve({
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: 'Revenue grew 12% in FY23.' } }],
            usage: chatUsage,
          }),
      });
    }

    throw new Error(`unexpected fetch to ${url}`);
  });
}

const fullEndpoint: EndpointRow = {
  id: 'endpoint-1',
  model: 'text-embedding-3-small',
  chat_model: 'gpt-4o-mini',
  base_url: 'https://llm.example.com/v1',
  api_key_secret_ref: KEY_REF,
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env[KEY_REF] = 'sk-test';
});

afterEach(() => {
  delete process.env[KEY_REF];
});

describe('answerDealQuestion', () => {
  it('embeds the question, retrieves deal chunks, generates a grounded answer, and logs the call', async () => {
    const chunks = [
      { id: 'chunk-a', content: 'FY23 revenue was 4.2M.', distance: 0.1 },
      { id: 'chunk-b', content: 'Marketing spend rose in Q4.', distance: 0.2 },
    ];
    const read = makeReadClient(fullEndpoint, chunks);
    const write = makeWriteClient();
    const fetchMock = mockFetch({ prompt_tokens: 321, completion_tokens: 42 });
    vi.stubGlobal('fetch', fetchMock);

    const result = await answerDealQuestion(
      read,
      { dealId: 'deal-1', question: 'How did revenue change?' },
      write.client,
    );

    const embeddingCall = fetchMock.mock.calls.find(([url]) =>
      (url as string).endsWith('/embeddings'),
    );
    expect(embeddingCall).toBeDefined();
    expect(JSON.parse((embeddingCall![1] as { body: string }).body)).toMatchObject({
      model: 'text-embedding-3-small',
      input: ['How did revenue change?'],
    });

    expect(read.rpc).toHaveBeenCalledWith('match_document_chunks', {
      p_deal_id: 'deal-1',
      p_embedding: JSON.stringify(EMBEDDING),
      p_match_count: 8,
    });

    const chatCall = fetchMock.mock.calls.find(([url]) =>
      (url as string).endsWith('/chat/completions'),
    );
    expect(chatCall).toBeDefined();
    const chatBody = JSON.parse((chatCall![1] as { body: string }).body);
    expect(chatBody.model).toBe('gpt-4o-mini');
    expect(chatBody.temperature).toBe(0.1);
    expect(JSON.stringify(chatBody.messages)).toContain('FY23 revenue was 4.2M.');

    expect(result.answer).toBe('Revenue grew 12% in FY23.');
    expect(result.citations).toEqual([
      { chunkId: 'chunk-a' },
      { chunkId: 'chunk-b' },
    ]);

    expect(write.insert).toHaveBeenCalledTimes(1);
    expect(write.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        account_id: 'acct-1',
        deal_id: 'deal-1',
        endpoint_id: 'endpoint-1',
        model: 'gpt-4o-mini',
        prompt_tokens: 321,
        completion_tokens: 42,
      }),
    );
  });

  it('logs null token counts when the provider returns no usage', async () => {
    const read = makeReadClient(fullEndpoint, [
      { id: 'chunk-a', content: 'x', distance: 0.1 },
    ]);
    const write = makeWriteClient();
    vi.stubGlobal('fetch', mockFetch(undefined));

    await answerDealQuestion(
      read,
      { dealId: 'deal-1', question: 'q' },
      write.client,
    );

    expect(write.insert).toHaveBeenCalledWith(
      expect.objectContaining({ prompt_tokens: null, completion_tokens: null }),
    );
  });

  it('throws when the endpoint has no chat_model', async () => {
    const read = makeReadClient({ ...fullEndpoint, chat_model: null }, []);
    const write = makeWriteClient();
    vi.stubGlobal('fetch', mockFetch(undefined));

    await expect(
      answerDealQuestion(read, { dealId: 'deal-1', question: 'q' }, write.client),
    ).rejects.toThrow();
  });

  it('throws when the endpoint api key is not present in the environment', async () => {
    delete process.env[KEY_REF];
    const read = makeReadClient(fullEndpoint, []);
    const write = makeWriteClient();
    vi.stubGlobal('fetch', mockFetch(undefined));

    await expect(
      answerDealQuestion(read, { dealId: 'deal-1', question: 'q' }, write.client),
    ).rejects.toThrow();
  });
});
