import { afterEach, describe, expect, it, vi } from 'vitest';

import { EMBEDDING_DIMENSIONS, embedTexts } from './embeddings';

const endpoint = {
  baseUrl: 'http://llm.test',
  model: 'text-embedding-3-small',
  apiKey: 'sk-test',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubEmbeddingResponse(
  data: { index: number; embedding: number[] }[],
): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ json: async () => ({ data }) })),
  );
}

describe('embedTexts', () => {
  it('returns the vectors ordered by their response index', () => {
    return (async () => {
      stubEmbeddingResponse([
        { index: 1, embedding: Array(EMBEDDING_DIMENSIONS).fill(0.2) },
        { index: 0, embedding: Array(EMBEDDING_DIMENSIONS).fill(0.1) },
      ]);

      const vectors = await embedTexts(endpoint, ['first', 'second']);

      expect(vectors).toHaveLength(2);
      expect(vectors[0]![0]).toBe(0.1);
      expect(vectors[1]![0]).toBe(0.2);
    })();
  });

  it('rejects when a model returns a vector whose dimension is not 1536', async () => {
    stubEmbeddingResponse([{ index: 0, embedding: Array(1024).fill(0.1) }]);

    await expect(embedTexts(endpoint, ['first'])).rejects.toThrow(/1024/);
    await expect(embedTexts(endpoint, ['first'])).rejects.toThrow(/1536/);
  });
});
