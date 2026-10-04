import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { extractStructuredFromDocument } from './extract';

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
  } as unknown as Parameters<typeof extractStructuredFromDocument>[0] & {
    from: ReturnType<typeof vi.fn>;
  };
}

const fullEndpoint: EndpointRow = {
  id: 'endpoint-1',
  chat_model: 'gpt-4o-mini',
  base_url: 'https://llm.example.com/v1',
  api_key_secret_ref: KEY_REF,
};

function stubFetch(doclingBodies: unknown[], chatContent: string) {
  const queue = [...doclingBodies];

  return vi.fn((url: string, _init?: RequestInit) => {
    if (url.endsWith('/chat/completions')) {
      return Promise.resolve({
        json: () =>
          Promise.resolve({ choices: [{ message: { content: chatContent } }] }),
      });
    }

    return Promise.resolve({ json: () => Promise.resolve(queue.shift()) });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  delete process.env.DOCLING_URL;
  delete process.env.DOCLING_API_KEY;
  delete process.env[KEY_REF];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('extractStructuredFromDocument', () => {
  it('converts the document via Docling then runs a structured LLM call over the markdown', async () => {
    process.env.DOCLING_URL = 'http://docling.test';
    process.env.DOCLING_API_KEY = 'docling-key';
    process.env[KEY_REF] = 'sk-test';

    const read = makeReadClient(fullEndpoint);
    const fetchMock = stubFetch(
      [
        { task_id: 't1' },
        { task_status: 'pending' },
        { task_status: 'success' },
        { document: { md_content: '# Revenue\n\n$507,676' } },
      ],
      '{"amount":507676}',
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await extractStructuredFromDocument(read, {
      accountId: 'acct-1',
      sourceUrl: 'http://signed/doc.pdf',
      instruction: 'Extract total annual revenue.',
      parse: (raw) => (raw as { amount: number | null }).amount,
    });

    expect(result).toEqual({ status: 'extracted', value: 507676 });

    const convertCall = fetchMock.mock.calls.find(([url]) =>
      (url as string).endsWith('/v1/convert/source/async'),
    );
    expect(convertCall).toBeDefined();

    const chatCall = fetchMock.mock.calls.find(([url]) =>
      (url as string).endsWith('/chat/completions'),
    );
    expect(chatCall).toBeDefined();
    const body = JSON.parse((chatCall![1] as { body: string }).body);
    expect(JSON.stringify(body.messages)).toContain('Extract total annual revenue.');
    expect(JSON.stringify(body.messages)).toContain('$507,676');
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('is an unavailable no-op when the docling endpoint is not configured', async () => {
    process.env[KEY_REF] = 'sk-test';
    const read = makeReadClient(fullEndpoint);
    const fetchMock = stubFetch([], '{}');
    vi.stubGlobal('fetch', fetchMock);

    const result = await extractStructuredFromDocument(read, {
      accountId: 'acct-1',
      sourceUrl: 'http://signed/doc.pdf',
      instruction: 'Extract total annual revenue.',
      parse: (raw) => raw,
    });

    expect(result.status).toBe('unavailable');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is an unavailable no-op when the account has no llm_endpoint', async () => {
    process.env.DOCLING_URL = 'http://docling.test';
    process.env.DOCLING_API_KEY = 'docling-key';

    const read = makeReadClient(null);
    const fetchMock = stubFetch([], '{}');
    vi.stubGlobal('fetch', fetchMock);

    const result = await extractStructuredFromDocument(read, {
      accountId: 'acct-1',
      sourceUrl: 'http://signed/doc.pdf',
      instruction: 'Extract total annual revenue.',
      parse: (raw) => raw,
    });

    expect(result.status).toBe('unavailable');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
