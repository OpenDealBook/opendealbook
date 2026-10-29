import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

import { type AiEndpoint, type AiRequest, completeWithTeamAi } from './aiClient';
import { recordAiCallUsage, reserveAiCall } from './caps';

export { CapReached } from './caps';

export const CONNECT_AI_PROVIDER = 'Connect an AI provider first';
export const ADD_EMBEDDING_MODEL = 'Add an embedding model to your AI provider';
export const ANTHROPIC_HAS_NO_EMBEDDINGS = 'Anthropic has no embeddings API; leave Embedding model empty';

export class TeamAiNotConnected extends Error {
  constructor(message = CONNECT_AI_PROVIDER) {
    super(message);
  }
}

declare const resolved: unique symbol;

export interface TeamAi {
  readonly [resolved]: true;
  accountId: string;
  endpointId: string;
  provider: AiEndpoint['provider'];
  model: string;
  baseUrl: string;
  apiKey: string;
}

export async function resolveTeamAi(
  accountId: string,
  kind: 'chat' | 'embedding',
): Promise<TeamAi | null> {
  const admin = getSupabaseServerAdminClient();
  const [{ data: endpoint }, { data: apiKey }] = await Promise.all([
    admin
      .from('llm_endpoint')
      .select('id, provider, model, chat_model, base_url')
      .eq('account_id', accountId)
      .maybeSingle()
      .throwOnError(),
    admin.rpc('llm_endpoint_api_key', { p_account_id: accountId }).throwOnError(),
  ]);
  const model = kind === 'chat' ? endpoint?.chat_model : endpoint?.model;
  if (!endpoint || !model || !apiKey) {
    return null;
  }
  return {
    accountId,
    endpointId: endpoint.id,
    provider: endpoint.provider as AiEndpoint['provider'],
    model,
    baseUrl: endpoint.base_url!,
    apiKey,
  } as TeamAi;
}

export async function meterTeamAiCall<T>(
  ai: TeamAi,
  call: { dealId?: string; firmId?: string },
  request: () => Promise<{ result: T; promptTokens: number | null; completionTokens: number | null }>,
): Promise<T> {
  const { callId } = await reserveAiCall(ai.accountId, {
    model: ai.model,
    endpointId: ai.endpointId,
    dealId: call.dealId,
    firmId: call.firmId,
  });
  const { result, ...usage } = await request();
  await recordAiCallUsage(callId, usage);
  return result;
}

export function completeMetered(
  ai: TeamAi,
  call: { dealId?: string; firmId?: string; signal?: AbortSignal },
  prompt: string,
  request?: AiRequest,
): Promise<string> {
  return meterTeamAiCall(ai, call, async () => {
    const completion = await completeWithTeamAi(
      { provider: ai.provider, model: ai.model, baseUrl: ai.baseUrl, apiKey: ai.apiKey },
      prompt,
      { signal: call.signal },
      request,
    );
    return {
      result: completion.text,
      promptTokens: completion.promptTokens,
      completionTokens: completion.completionTokens,
    };
  });
}
