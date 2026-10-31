'use server';

import { z } from 'zod';

import { refusableAction } from '@odb/next/actions/refusable-action';
import { Refusal } from '@odb/next/refusal';
import { getSupabaseServerClient } from '@odb/supabase/server';

const kindSchema = z.enum(['email_lookup', 'letters', 'courts', 'court_records']);

const REFUSALS: Record<string, string> = {
  '42501': 'Changing provider keys needs settings.manage',
  '23514': 'Paste an API key',
  '22P02': 'Use an Apify actor id such as username/actor-name',
};

function refuseOrThrow(error: { code: string } | null) {
  if (error && REFUSALS[error.code]) {
    throw new Refusal(REFUSALS[error.code]!);
  }
  if (error) {
    throw error;
  }
}

export const saveProviderKeyAction = refusableAction(
  async ({ accountId, kind, apiKey, actorId, webhookSecret, provider }) => {
    const { error } = await getSupabaseServerClient().rpc('save_provider_credential', {
      p_account_id: accountId,
      p_kind: kind,
      p_api_key: apiKey || undefined,
      p_actor_id: actorId || undefined,
      p_webhook_secret: webhookSecret || undefined,
      p_provider: provider,
    });
    refuseOrThrow(error);
  },
  z.object({
    accountId: z.uuid(),
    kind: kindSchema,
    apiKey: z.string(),
    actorId: z.string().trim(),
    webhookSecret: z.string().optional(),
    provider: z.enum(['baselayer', 'middesk']).optional(),
  }),
);

export const disconnectProviderKeyAction = refusableAction(
  async ({ accountId, kind }) => {
    const { error } = await getSupabaseServerClient().rpc('disconnect_provider_credential', {
      p_account_id: accountId,
      p_kind: kind,
    });
    refuseOrThrow(error);
  },
  z.object({ accountId: z.uuid(), kind: kindSchema }),
);
