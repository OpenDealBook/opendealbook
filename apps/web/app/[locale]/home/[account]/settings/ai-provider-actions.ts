'use server';

import { z } from 'zod';

import { refusableAction } from '@odb/next/actions/refusable-action';
import { Refusal } from '@odb/next/refusal';
import { getSupabaseServerClient } from '@odb/supabase/server';
import { AddressNotFound, isPublicHttpsUrl } from '@odb/workflows/builder/publicUrl';
import { ANTHROPIC_HAS_NO_EMBEDDINGS, privateAiUrlsAllowed } from '@odb/workflows/team-ai';

const NOT_PUBLIC = 'Use a public HTTPS base URL';

const REFUSALS: Record<string, string> = {
  '42501': 'Changing the AI provider needs settings.manage',
  '23514': 'Paste an API key',
  '22023': NOT_PUBLIC,
};

function refuseOrThrow(error: { code: string } | null) {
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
  async ({ accountId, provider, model, embeddingModel, baseUrl, apiKey }) => {
    if (provider === 'openai_compatible' && !privateAiUrlsAllowed() && !(await publicOrRefuse(baseUrl))) {
      throw new Refusal(NOT_PUBLIC);
    }
    const { error } = await getSupabaseServerClient().rpc('save_llm_endpoint', {
      p_account_id: accountId,
      p_provider: provider,
      p_model: model,
      p_embedding_model: embeddingModel || undefined,
      p_base_url: baseUrl,
      p_api_key: apiKey || undefined,
    });

    refuseOrThrow(error);
  },
  z
    .object({
      accountId: z.uuid(),
      provider: z.enum(['openai', 'anthropic', 'openai_compatible']),
      model: z.string().trim().min(1, 'Enter a model'),
      embeddingModel: z.string().trim(),
      baseUrl: z.string(),
      apiKey: z.string(),
    })
    .refine(
      (input) => input.provider !== 'openai_compatible' || z.url().safeParse(input.baseUrl).success,
      'Enter the base URL of your endpoint',
    )
    .refine(
      (input) => input.provider !== 'anthropic' || !input.embeddingModel,
      ANTHROPIC_HAS_NO_EMBEDDINGS,
    ),
);

export const disconnectAiProviderAction = refusableAction(
  async ({ accountId }) => {
    const { error } = await getSupabaseServerClient().rpc('disconnect_llm_endpoint', {
      p_account_id: accountId,
    });
    refuseOrThrow(error);
  },
  z.object({ accountId: z.uuid() }),
);
