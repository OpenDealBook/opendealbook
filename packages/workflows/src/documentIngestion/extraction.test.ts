import { afterEach, describe, expect, it, vi } from 'vitest';

import { extractFigure } from './extraction';

const endpoint = {
  baseUrl: 'http://llm.test',
  chatModel: 'gpt-4o-mini',
  apiKey: 'sk-test',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubChat(content: string, usage?: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      json: async () => ({ choices: [{ message: { content } }], usage }),
    })),
  );
}

describe('extractFigure', () => {
  it('parses the amount and token usage from a structured chat response', async () => {
    stubChat('{"amount": 1234}', {
      prompt_tokens: 40,
      completion_tokens: 5,
    });

    const result = await extractFigure(endpoint, 'pull the wages', '# W-2');

    expect(result).toEqual({
      amount: 1234,
      promptTokens: 40,
      completionTokens: 5,
    });
  });

  it('reports null token counts when the response carries no usage', async () => {
    stubChat('{"amount": 500}');

    const result = await extractFigure(endpoint, 'pull the wages', '# W-2');

    expect(result.promptTokens).toBeNull();
    expect(result.completionTokens).toBeNull();
  });

  it('returns a null amount when the model reports the figure is absent', async () => {
    stubChat('{"amount": null}');

    const result = await extractFigure(endpoint, 'pull the wages', '# blank');

    expect(result.amount).toBeNull();
  });
});
