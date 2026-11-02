// USD per million tokens, copied on 2026-11-01 from the vendors' standard-tier
// pricing pages: https://developers.openai.com/api/docs/pricing and
// https://platform.claude.com/docs/en/about-claude/pricing (Anthropic cache
// writes use the 5-minute rate). A model priced without cached input bills
// cached tokens at its input rate. Models missing here, and every
// openai_compatible endpoint without team-entered prices, have no price: their
// calls cost no credits and the cap never stops them.

import type { AiEndpoint } from './aiClient';

export type Usage = {
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
};

type Rates = {
  inputPerMTok: number;
  cachedInputPerMTok: number;
  cacheWritePerMTok: number;
  outputPerMTok: number;
};

export type ModelPrice = Rates & {
  longContext?: { overInputTokens: number; rates: Rates };
};

const OPENAI_LONG_CONTEXT_OVER = 272_000;

function openAi(input: number, cached: number | null, output: number): Rates {
  return {
    inputPerMTok: input,
    cachedInputPerMTok: cached ?? input,
    cacheWritePerMTok: input,
    outputPerMTok: output,
  };
}

function openAiTiered(short: Rates, long: Rates): ModelPrice {
  return {
    ...short,
    longContext: { overInputTokens: OPENAI_LONG_CONTEXT_OVER, rates: long },
  };
}

function anthropic(
  input: number,
  cacheWrite: number,
  cacheHit: number,
  output: number,
): Rates {
  return {
    inputPerMTok: input,
    cachedInputPerMTok: cacheHit,
    cacheWritePerMTok: cacheWrite,
    outputPerMTok: output,
  };
}

const MODEL_PRICES: Record<
  'openai' | 'anthropic',
  Record<string, ModelPrice>
> = {
  openai: {
    'gpt-6-astra': openAiTiered(openAi(10, 1, 50), openAi(20, 2, 75)),
    'gpt-6.1-sol': openAiTiered(openAi(2, 0.1, 10), openAi(4, 0.2, 15)),
    'gpt-6.1-terra': openAiTiered(openAi(1, 0.05, 5), openAi(2, 0.1, 7.5)),
    'gpt-6-luna': openAiTiered(openAi(0.1, 0.01, 0.5), openAi(0.2, 0.02, 0.75)),
    'gpt-6-sol': openAiTiered(openAi(2, 0.2, 10), openAi(4, 0.4, 15)),
    'gpt-5.6-sol': openAiTiered(openAi(4, 0.4, 20), openAi(8, 0.8, 30)),
    'gpt-5.6-terra': openAiTiered(openAi(2, 0.2, 12), openAi(4, 0.4, 18)),
    'gpt-5.6-luna': openAiTiered(
      openAi(0.2, 0.02, 1.2),
      openAi(0.4, 0.04, 1.8),
    ),
    'gpt-5.5': openAiTiered(openAi(5, 0.5, 30), openAi(10, 1, 45)),
    'gpt-5.5-pro': openAiTiered(openAi(30, null, 180), openAi(60, null, 270)),
    'gpt-5.4': openAiTiered(openAi(2.5, 0.25, 15), openAi(5, 0.5, 22.5)),
    'gpt-5.4-pro': openAiTiered(openAi(30, null, 180), openAi(60, null, 270)),
    'gpt-5.4-mini': openAi(0.75, 0.075, 4.5),
    'gpt-5.4-nano': openAi(0.2, 0.02, 1.25),
    'gpt-5.2': openAi(1.75, 0.175, 14),
    'gpt-5.2-pro': openAi(21, null, 168),
    'gpt-5.1': openAi(1.25, 0.125, 10),
    'gpt-5': openAi(1.25, 0.125, 10),
    'gpt-5-mini': openAi(0.25, 0.025, 2),
    'gpt-5-nano': openAi(0.05, 0.005, 0.4),
    'gpt-5-pro': openAi(15, null, 120),
    'gpt-4.1': openAi(2, 0.5, 8),
    'gpt-4.1-mini': openAi(0.4, 0.1, 1.6),
    'gpt-4.1-nano': openAi(0.1, 0.025, 0.4),
    'gpt-4o': openAi(2.5, 1.25, 10),
    'gpt-4o-2024-05-13': openAi(5, null, 15),
    'gpt-4o-mini': openAi(0.15, 0.075, 0.6),
    o1: openAi(15, 7.5, 60),
    'o1-pro': openAi(150, null, 600),
    'o3-pro': openAi(20, null, 80),
    o3: openAi(2, 0.5, 8),
    'o4-mini': openAi(1.1, 0.275, 4.4),
    'o3-mini': openAi(1.1, 0.55, 4.4),
    'gpt-4-turbo-2024-04-09': openAi(10, null, 30),
    'gpt-4-0613': openAi(30, null, 60),
    'gpt-3.5-turbo': openAi(0.5, null, 1.5),
    'gpt-3.5-turbo-0125': openAi(0.5, null, 1.5),
    'text-embedding-3-small': openAi(0.02, null, 0),
    'text-embedding-3-large': openAi(0.13, null, 0),
    'text-embedding-ada-002': openAi(0.1, null, 0),
  },
  anthropic: {
    'claude-fable-5-1': anthropic(10, 12.5, 0.25, 50),
    'claude-fable-5': anthropic(10, 12.5, 1, 50),
    'claude-opus-5-5': anthropic(4, 5, 0.2, 20),
    'claude-opus-5': anthropic(5, 6.25, 0.5, 25),
    'claude-opus-4-8': anthropic(5, 6.25, 0.5, 25),
    'claude-opus-4-7': anthropic(5, 6.25, 0.5, 25),
    'claude-opus-4-6': anthropic(5, 6.25, 0.5, 25),
    'claude-opus-4-5': anthropic(5, 6.25, 0.5, 25),
    'claude-sonnet-5-5': anthropic(2, 2.5, 0.1, 10),
    'claude-sonnet-5': anthropic(2, 2.5, 0.2, 10),
    'claude-sonnet-4-6': anthropic(3, 3.75, 0.3, 15),
    'claude-sonnet-4-5': anthropic(3, 3.75, 0.3, 15),
    'claude-haiku-5-5': {
      ...anthropic(0.1, 0.125, 0.01, 0.5),
      longContext: {
        overInputTokens: 100_000,
        rates: anthropic(0.5, 0.625, 0.05, 2.5),
      },
    },
    'claude-haiku-4-5': anthropic(1, 1.25, 0.1, 5),
  },
};

const SNAPSHOT_DATE = /-(\d{4}-\d{2}-\d{2}|\d{8})$/;

export function priceOf(
  provider: AiEndpoint['provider'],
  model: string,
): ModelPrice | null {
  if (provider === 'openai_compatible') {
    return null;
  }
  const prices = MODEL_PRICES[provider];
  return prices[model] ?? prices[model.replace(SNAPSHOT_DATE, '')] ?? null;
}

export function creditsFor(price: ModelPrice, usage: Usage): number {
  const promptTokens =
    usage.inputTokens + usage.cachedInputTokens + usage.cacheWriteTokens;
  const rates =
    price.longContext && promptTokens > price.longContext.overInputTokens
      ? price.longContext.rates
      : price;
  return (
    (usage.inputTokens * rates.inputPerMTok +
      usage.cachedInputTokens * rates.cachedInputPerMTok +
      usage.cacheWriteTokens * rates.cacheWritePerMTok +
      usage.outputTokens * rates.outputPerMTok) /
    1e4
  );
}

export function estimatedTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function estimatedUsage(prompt: string, outputTokens: number): Usage {
  return {
    inputTokens: estimatedTokens(prompt),
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    outputTokens,
  };
}
