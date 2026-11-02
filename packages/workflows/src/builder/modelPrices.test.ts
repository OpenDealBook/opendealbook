import { describe, expect, it } from 'vitest';

import { creditsFor, priceOf, type Usage } from './modelPrices';

function usage(tokens: Partial<Usage>): Usage {
  return {
    inputTokens: 0,
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
    ...tokens,
  };
}

const OUTPUT_ONLY = usage({ outputTokens: 1000 });

describe('model prices', () => {
  it('prices a dated snapshot like the model it pins', () => {
    expect(priceOf('openai', 'gpt-4o-2024-08-06')).toEqual(
      priceOf('openai', 'gpt-4o'),
    );
    expect(priceOf('anthropic', 'claude-sonnet-4-5-20250929')).toEqual(
      priceOf('anthropic', 'claude-sonnet-4-5'),
    );
  });

  it('prefers a snapshot listed with its own price', () => {
    expect(
      creditsFor(priceOf('openai', 'gpt-4o-2024-05-13')!, OUTPUT_ONLY),
    ).toBe(15000 / 1e4);
    expect(creditsFor(priceOf('openai', 'gpt-4o')!, OUTPUT_ONLY)).toBe(
      10000 / 1e4,
    );
  });

  it('charges input, cached input and output at their own rates', () => {
    expect(
      creditsFor(
        priceOf('openai', 'gpt-4o')!,
        usage({
          inputTokens: 1000,
          cachedInputTokens: 2000,
          outputTokens: 500,
        }),
      ),
    ).toBeCloseTo((1000 * 2.5 + 2000 * 1.25 + 500 * 10) / 1e4, 10);
  });

  it('charges Anthropic cache writes and cache hits at their own rates', () => {
    expect(
      creditsFor(
        priceOf('anthropic', 'claude-sonnet-4-6')!,
        usage({
          inputTokens: 1000,
          cachedInputTokens: 1000,
          cacheWriteTokens: 1000,
          outputTokens: 1000,
        }),
      ),
    ).toBeCloseTo((1000 * 3 + 1000 * 0.3 + 1000 * 3.75 + 1000 * 15) / 1e4, 10);
  });

  it('switches to the long-context rate once the prompt passes the threshold', () => {
    const haiku = priceOf('anthropic', 'claude-haiku-5-5')!;

    expect(creditsFor(haiku, usage({ inputTokens: 100_000 }))).toBeCloseTo(
      (100_000 * 0.1) / 1e4,
      10,
    );
    expect(
      creditsFor(
        haiku,
        usage({ inputTokens: 90_000, cachedInputTokens: 10_001 }),
      ),
    ).toBeCloseTo((90_000 * 0.5 + 10_001 * 0.05) / 1e4, 10);
  });

  it('has no price for a model it does not list, or for any OpenAI-compatible endpoint', () => {
    expect(priceOf('openai', 'gpt-5.7')).toBeNull();
    expect(priceOf('anthropic', 'claude-opus-9')).toBeNull();
    expect(priceOf('openai_compatible', 'gpt-4o')).toBeNull();
  });

  it('prices embeddings by their input tokens', () => {
    expect(
      creditsFor(
        priceOf('openai', 'text-embedding-3-small')!,
        usage({ inputTokens: 1000 }),
      ),
    ).toBeCloseTo((1000 * 0.02) / 1e4, 10);
  });
});
