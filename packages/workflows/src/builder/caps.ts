import type { Json } from '@odb/supabase';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

export class CapReached extends Error {
  constructor(
    message = 'The monthly AI limit is reached',
    readonly resumeAt?: Date,
  ) {
    super(message);
  }
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
  call: { model: string; endpointId: string | null; firmId?: string; dealId?: string },
): Promise<{ callId: string }> {
  const { data: callId } = await getSupabaseServerAdminClient()
    .rpc('reserve_ai_call', {
      p_account_id: accountId,
      p_model: call.model,
      p_endpoint_id: call.endpointId ?? undefined,
      p_firm_id: call.firmId,
      p_deal_id: call.dealId,
    })
    .throwOnError();
  if (callId === null) {
    throw new CapReached();
  }
  return { callId };
}

export async function recordAiCallUsage(
  callId: string,
  usage: { promptTokens: number | null; completionTokens: number | null },
): Promise<void> {
  await getSupabaseServerAdminClient()
    .from('ai_call_log')
    .update({ prompt_tokens: usage.promptTokens, completion_tokens: usage.completionTokens })
    .eq('id', callId)
    .throwOnError();
}
