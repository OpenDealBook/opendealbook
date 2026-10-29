import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { fakeAiProvider } from '../../test-support/fake-ai-provider';
import { EMBEDDING_DIMENSIONS, embedTexts } from './embeddings';

let provider: Awaited<ReturnType<typeof fakeAiProvider>>;

async function serve(data: { index: number; embedding: number[] }[]) {
  provider = await fakeAiProvider({ status: 200, body: { data } });
  return { baseUrl: provider.baseUrl, model: 'text-embedding-3-small', apiKey: 'sk-test' };
}

beforeEach(() => {
  process.env.ODB_ALLOW_PRIVATE_AI_URL = '1';
  process.env.ODB_STACK = 'local';
});

afterEach(() => {
  provider.close();
  delete process.env.ODB_ALLOW_PRIVATE_AI_URL;
  delete process.env.ODB_STACK;
});

describe('embedTexts', () => {
  it('returns the vectors ordered by their response index', async () => {
    const endpoint = await serve([
      { index: 1, embedding: Array(EMBEDDING_DIMENSIONS).fill(0.2) },
      { index: 0, embedding: Array(EMBEDDING_DIMENSIONS).fill(0.1) },
    ]);

    const vectors = await embedTexts(endpoint, ['first', 'second']);

    expect(vectors).toHaveLength(2);
    expect(vectors[0]![0]).toBe(0.1);
    expect(vectors[1]![0]).toBe(0.2);
    expect(provider.received).toMatchObject([
      {
        path: '/v1/embeddings',
        headers: { authorization: 'Bearer sk-test' },
        body: { model: 'text-embedding-3-small', input: ['first', 'second'] },
      },
    ]);
  });

  it('rejects when a model returns a vector whose dimension is not 1536', async () => {
    const endpoint = await serve([{ index: 0, embedding: Array(1024).fill(0.1) }]);

    await expect(embedTexts(endpoint, ['first'])).rejects.toThrow(/1024/);
    await expect(embedTexts(endpoint, ['first'])).rejects.toThrow(/1536/);
  });

  it('refuses a private provider address unless private AI URLs are allowed', async () => {
    const endpoint = await serve([]);
    delete process.env.ODB_ALLOW_PRIVATE_AI_URL;
    delete process.env.ODB_STACK;

    await expect(embedTexts(endpoint, ['first'])).rejects.toThrow('Use a public HTTPS base URL');
    expect(provider.received).toEqual([]);
  });
});
