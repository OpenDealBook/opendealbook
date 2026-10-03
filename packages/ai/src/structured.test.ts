import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { generateStructured } from './structured';

const KEY_REF = 'TEST_LLM_KEY';

interface EndpointRow {
  id: string;
  chat_model: string | null;
  base_url: string | null;
  api_key_secret_ref: string | null;
}

function makeReadClient(endpoint: EndpointRow | null) {
  function makeBuilder() {
    const builder: Record<string, unknown> = {};
    const chain = () => builder;

    builder.select = chain;
    builder.eq = chain;
    builder.single = () =>
      Promise.resolve({
        data: endpoint,
        error: endpoint ? null : { message: 'no endpoint' },
      });

    return builder;
  }

  return {
    from: vi.fn(() => makeBuilder()),
  } as unknown as Parameters<typeof generateStructured>[0] & {
    from: ReturnType<typeof vi.fn>;
  };
}

function mockFetch(content: string) {
  return vi.fn((url: string, _init?: RequestInit) => {
    if (url.endsWith('/chat/completions')) {
      return Promise.resolve({
        json: () =>
          Promise.resolve({ choices: [{ message: { content } }] }),
      });
    }

    throw new Error(`unexpected fetch to ${url}`);
  });
}

const fullEndpoint: EndpointRow = {
  id: 'endpoint-1',
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

describe('generateStructured', () => {
  it('resolves the account endpoint, requests JSON, and applies parse to the parsed content', async () => {
    const read = makeReadClient(fullEndpoint);
    const fetchMock = mockFetch('{"foo":"bar","n":3}');
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateStructured(read, {
      accountId: 'acct-1',
      system: 'system instructions',
      prompt: 'the prompt body',
      parse: (raw) => {
        const value = raw as { foo: string; n: number };
        return { picked: value.foo, doubled: value.n * 2 };
      },
    });

    expect(read.from).toHaveBeenCalledWith('llm_endpoint');

    const chatCall = fetchMock.mock.calls.find(([url]) =>
      (url as string).endsWith('/chat/completions'),
    );
    expect(chatCall).toBeDefined();
    expect(chatCall![0]).toBe('https://llm.example.com/v1/chat/completions');

    const body = JSON.parse((chatCall![1] as { body: string }).body);
    expect(body.model).toBe('gpt-4o-mini');
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(JSON.stringify(body.messages)).toContain('system instructions');
    expect(JSON.stringify(body.messages)).toContain('the prompt body');

    expect(result).toEqual({ picked: 'bar', doubled: 6 });
  });

  it('throws when the account has no endpoint', async () => {
    const read = makeReadClient(null);
    vi.stubGlobal('fetch', mockFetch('{}'));

    await expect(
      generateStructured(read, {
        accountId: 'acct-1',
        system: 's',
        prompt: 'p',
        parse: (raw) => raw,
      }),
    ).rejects.toThrow();
  });
});
