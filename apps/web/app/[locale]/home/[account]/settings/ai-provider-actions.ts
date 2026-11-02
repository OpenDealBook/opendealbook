'use server';

import { z } from 'zod';

import { refusableAction } from '@odb/next/actions/refusable-action';
import { Refusal } from '@odb/next/refusal';
import { getLogger } from '@odb/shared/logger';
import { getSupabaseServerClient } from '@odb/supabase/server';
import {
  AddressNotFound,
  isPublicHttpsUrl,
} from '@odb/workflows/builder/publicUrl';
import {
  getTemporalClient,
  triggerDocumentIngestionBackfill,
} from '@odb/workflows/client';
import {
  ANTHROPIC_HAS_NO_EMBEDDINGS,
  operatorListsPrivateAiHost,
  privateAiUrlsAllowed,
} from '@odb/workflows/team-ai';

const NOT_PUBLIC = 'Use a public HTTPS base URL';
const PRICE = /^\d+(\.\d+)?$/;
const price = z.string().trim();

const REFUSALS: Record<string, string> = {
  '42501': 'Changing the AI provider needs settings.manage',
  '23514': 'Paste an API key',
  '22023': NOT_PUBLIC,
};

function refuseOrThrow(error: { code: string; message: string } | null) {
  if (error?.message.includes('llm_endpoint_prices')) {
    throw new Refusal(
      'Enter all three prices as numbers of 0 or more, or leave them all empty',
    );
  }
  if (error && REFUSALS[error.code]) {
    throw new Refusal(REFUSALS[error.code]!);
  }
  if (error) {
    throw error;
  }
}

function publicOrRefuse(baseUrl: string): Promise<boolean> {
  return isPublicHttpsUrl(baseUrl).catch((error: unknown) => {
    throw error instanceof AddressNotFound ? new Refusal(error.message) : error;
  });
}

export const saveAiProviderAction = refusableAction(
  async ({
    accountId,
    provider,
    model,
    embeddingModel,
    baseUrl,
    apiKey,
    prices,
  }) => {
    const priced =
      provider === 'openai_compatible' && prices?.input ? prices : undefined;
    if (
      provider === 'openai_compatible' &&
      !privateAiUrlsAllowed() &&
      !operatorListsPrivateAiHost(baseUrl) &&
      !(await publicOrRefuse(baseUrl))
    ) {
      throw new Refusal(NOT_PUBLIC);
    }
    const { error } = await getSupabaseServerClient().rpc('save_llm_endpoint', {
      p_account_id: accountId,
      p_provider: provider,
      p_model: model,
      p_embedding_model: embeddingModel || undefined,
      p_base_url: baseUrl,
      p_api_key: apiKey || undefined,
      p_input_price_per_mtok: priced && Number(priced.input),
      p_cached_input_price_per_mtok: priced && Number(priced.cachedInput),
      p_output_price_per_mtok: priced && Number(priced.output),
    });

    refuseOrThrow(error);
    try {
      await triggerDocumentIngestionBackfill(
        await getTemporalClient(),
        accountId,
      );
    } catch (backfillError) {
      getLogger().error(
        { err: backfillError },
        'Document backfill did not start after saving the AI provider',
      );
    }
  },
  z
    .object({
      accountId: z.uuid(),
      provider: z.enum(['openai', 'anthropic', 'openai_compatible']),
      model: z.string().trim().min(1, 'Enter a model'),
      embeddingModel: z.string().trim(),
      baseUrl: z.string(),
      apiKey: z.string(),
      prices: z
        .object({ input: price, cachedInput: price, output: price })
        .optional(),
    })
    .refine(
      (input) =>
        input.provider !== 'openai_compatible' ||
        z.url().safeParse(input.baseUrl).success,
      'Enter the base URL of your endpoint',
    )
    .refine(
      (input) => input.provider !== 'anthropic' || !input.embeddingModel,
      ANTHROPIC_HAS_NO_EMBEDDINGS,
    )
    .refine(
      ({ prices }) =>
        !prices ||
        new Set(Object.values(prices).map((value) => value === '')).size === 1,
      'Enter all three prices, or leave them all empty',
    )
    .refine(
      ({ prices }) =>
        !prices ||
        Object.values(prices).every((value) => !value || PRICE.test(value)),
      'Prices must be numbers of 0 or more',
    ),
);

export const disconnectAiProviderAction = refusableAction(
  async ({ accountId }) => {
    const { error } = await getSupabaseServerClient().rpc(
      'disconnect_llm_endpoint',
      {
        p_account_id: accountId,
      },
    );
    refuseOrThrow(error);
  },
  z.object({ accountId: z.uuid() }),
);
