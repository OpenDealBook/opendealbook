import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

import {
  type AiEndpoint,
  type AiRequest,
  completeWithTeamAi,
  type Conversation,
  type ConversationTurn,
  converseWithTeamAi,
  DEFAULT_MAX_TOKENS,
} from './aiClient';
import { reserveAiCall, settleAiCall } from './caps';
import {
  creditsFor,
  estimatedUsage,
  type ModelPrice,
  priceOf,
  type Usage,
} from './modelPrices';

export { CapReached } from './caps';

export const CONNECT_AI_PROVIDER = 'Connect an AI provider first';
export const ADD_EMBEDDING_MODEL = 'Add an embedding model to your AI provider';
export const ANTHROPIC_HAS_NO_EMBEDDINGS =
  'Anthropic has no embeddings API; leave Embedding model empty';

declare const resolved: unique symbol;

export interface TeamAi {
  readonly [resolved]: true;
  accountId: string;
  endpointId: string;
  provider: AiEndpoint['provider'];
  model: string;
  baseUrl: string;
  apiKey: string;
  price: ModelPrice | null;
}

export async function resolveTeamAi(
  accountId: string,
  kind: 'chat' | 'embedding',
): Promise<TeamAi | null> {
  const admin = getSupabaseServerAdminClient();
  const [{ data: endpoint }, { data: apiKey }] = await Promise.all([
    admin
      .from('llm_endpoint')
      .select(
        'id, provider, model, chat_model, base_url, input_price_per_mtok, cached_input_price_per_mtok, output_price_per_mtok',
      )
      .eq('account_id', accountId)
      .maybeSingle()
      .throwOnError(),
    admin
      .rpc('llm_endpoint_api_key', { p_account_id: accountId })
      .throwOnError(),
  ]);
  const model = kind === 'chat' ? endpoint?.chat_model : endpoint?.model;
  if (!endpoint || !model || !apiKey) {
    return null;
  }
  const provider = endpoint.provider as AiEndpoint['provider'];
  return {
    accountId,
    endpointId: endpoint.id,
    provider,
    model,
    baseUrl: endpoint.base_url!,
    apiKey,
    price:
      endpoint.input_price_per_mtok === null
        ? priceOf(provider, model)
        : {
            inputPerMTok: endpoint.input_price_per_mtok,
            cachedInputPerMTok: endpoint.cached_input_price_per_mtok!,
            cacheWritePerMTok: endpoint.input_price_per_mtok,
            outputPerMTok: endpoint.output_price_per_mtok!,
          },
  } as TeamAi;
}

function creditsOf(ai: TeamAi, usage: Usage): number {
  return ai.price ? creditsFor(ai.price, usage) : 0;
}

export async function meterTeamAiCall<T>(
  ai: TeamAi,
  call: {
    dealId?: string;
    firmId?: string;
    createdBy?: string;
    questionId?: string;
  },
  worstCase: Usage,
  request: () => Promise<{ result: T; usage: Usage }>,
): Promise<T> {
  const { callId } = await reserveAiCall(ai.accountId, {
    model: ai.model,
    credits: creditsOf(ai, worstCase),
    endpointId: ai.endpointId,
    dealId: call.dealId,
    firmId: call.firmId,
    createdBy: call.createdBy,
    questionId: call.questionId,
  });
  const { result, usage } = await request().catch(async (error: unknown) => {
    await settleAiCall(callId, null, 0);
    throw error;
  });
  await settleAiCall(callId, usage, creditsOf(ai, usage));
  return result;
}

export function completeMetered(
  ai: TeamAi,
  call: { dealId?: string; firmId?: string; signal?: AbortSignal },
  prompt: string,
  request?: AiRequest,
): Promise<string> {
  const worstCase = estimatedUsage(
    (request?.system ?? '') + prompt,
    request?.maxTokens ?? DEFAULT_MAX_TOKENS,
  );
  return meterTeamAiCall(ai, call, worstCase, async () => {
    const completion = await completeWithTeamAi(
      {
        provider: ai.provider,
        model: ai.model,
        baseUrl: ai.baseUrl,
        apiKey: ai.apiKey,
      },
      prompt,
      { signal: call.signal },
      request,
    );
    return { result: completion.text, usage: completion.usage };
  });
}

export async function converseMetered(
  ai: TeamAi,
  call: { dealId: string; askedBy: string; questionId: string },
  conversation: Conversation,
): Promise<{ turn: ConversationTurn; credits: number }> {
  const worstCase = estimatedUsage(
    JSON.stringify(conversation),
    conversation.maxTokens ?? DEFAULT_MAX_TOKENS,
  );
  const turn = await meterTeamAiCall(
    ai,
    {
      dealId: call.dealId,
      createdBy: call.askedBy,
      questionId: call.questionId,
    },
    worstCase,
    async () => {
      const result = await converseWithTeamAi(
        {
          provider: ai.provider,
          model: ai.model,
          baseUrl: ai.baseUrl,
          apiKey: ai.apiKey,
        },
        conversation,
      );
      return { result, usage: result.usage };
    },
  );
  return { turn, credits: creditsOf(ai, turn.usage) };
}
