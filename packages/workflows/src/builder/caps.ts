import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

export class CapReached extends Error {
  constructor() {
    super('The monthly AI limit is reached');
  }
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
