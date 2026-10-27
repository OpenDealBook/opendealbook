import { ApplicationFailure } from '@temporalio/common';

import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

import { type AiEndpoint, completeWithTeamAi } from './aiClient';
import { recordAiCallUsage, reserveAiCall } from './caps';
import { redactPeople } from './redact';

export function parsedJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export async function askTeamAi(args: {
  accountId: string;
  prompt: string;
  firmId?: string;
  dealId?: string;
  noProviderMessage?: string;
  signal?: AbortSignal;
}): Promise<{ text: string; endpointId: string; model: string }> {
  const admin = getSupabaseServerAdminClient();
  const [{ data: endpoint }, { data: apiKey }, { data: names }] = await Promise.all([
    admin
      .from('llm_endpoint')
      .select('id, provider, chat_model, base_url')
      .eq('account_id', args.accountId)
      .maybeSingle()
      .throwOnError(),
    admin.rpc('llm_endpoint_api_key', { p_account_id: args.accountId }).throwOnError(),
    admin.rpc('team_people_names', { p_account_id: args.accountId }).throwOnError(),
  ]);
  const model = endpoint?.chat_model;
  if (!endpoint || !model || !apiKey) {
    throw ApplicationFailure.nonRetryable(
      args.noProviderMessage ?? 'Connect an AI provider first',
    );
  }

  args.signal?.throwIfAborted();
  const { callId } = await reserveAiCall(args.accountId, {
    model,
    endpointId: endpoint.id,
    firmId: args.firmId,
    dealId: args.dealId,
  });

  const completion = await completeWithTeamAi(
    {
      provider: endpoint.provider as AiEndpoint['provider'],
      model,
      baseUrl: endpoint.base_url!,
      apiKey,
    },
    redactPeople(args.prompt, names!),
    { signal: args.signal },
  );

  await recordAiCallUsage(callId, completion);

  return { text: completion.text, endpointId: endpoint.id, model };
}
