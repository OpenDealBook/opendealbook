import type { Json } from '@odb/supabase';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

import type { Usage } from './modelPrices';

export const AI_CREDITS_RUN_OUT = 'Not enough AI credits left this month';

export class CapReached extends Error {
  constructor(
    message: string,
    readonly resumeAt?: Date,
  ) {
    super(message);
  }
}

function startOfNextUtcMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

export async function reserveLookup(lookup: {
  id: string;
  accountId: string;
  firmId: string;
  dealId?: string;
  provider: string;
}): Promise<void> {
  const { data: reserved } = await getSupabaseServerAdminClient()
    .rpc('reserve_lookup', {
      p_id: lookup.id,
      p_account_id: lookup.accountId,
      p_firm_id: lookup.firmId,
      p_kind: 'email_lookup',
      p_provider: lookup.provider,
      p_deal_id: lookup.dealId,
    })
    .throwOnError();
  if (!reserved) {
    throw new CapReached('The monthly lookup limit is reached');
  }
}

export async function recordLookup(
  id: string,
  lookup: { outcome: 'found' | 'not_found' | 'failed'; result: Json },
): Promise<void> {
  await getSupabaseServerAdminClient()
    .from('paid_lookup')
    .update({ outcome: lookup.outcome, result: lookup.result })
    .eq('id', id)
    .throwOnError();
}

export async function reserveAiCall(
  accountId: string,
  call: {
    model: string;
    credits: number;
    endpointId: string | null;
    firmId?: string;
    dealId?: string;
    createdBy?: string;
    questionId?: string;
  },
): Promise<{ callId: string }> {
  const { data: callId } = await getSupabaseServerAdminClient()
    .rpc('reserve_ai_call', {
      p_account_id: accountId,
      p_model: call.model,
      p_credits: call.credits,
      p_endpoint_id: call.endpointId ?? undefined,
      p_firm_id: call.firmId,
      p_deal_id: call.dealId,
      p_created_by: call.createdBy,
      p_question_id: call.questionId,
    })
    .throwOnError();
  if (callId === null) {
    throw new CapReached(AI_CREDITS_RUN_OUT, startOfNextUtcMonth());
  }
  return { callId };
}

export async function settleAiCall(
  callId: string,
  usage: Usage | null,
  credits: number,
): Promise<void> {
  await getSupabaseServerAdminClient()
    .from('ai_call_log')
    .update({
      prompt_tokens: usage
        ? usage.inputTokens + usage.cachedInputTokens + usage.cacheWriteTokens
        : null,
      completion_tokens: usage?.outputTokens ?? null,
      credits,
      settled_at: new Date().toISOString(),
    })
    .eq('id', callId)
    .is('settled_at', null)
    .throwOnError();
}
