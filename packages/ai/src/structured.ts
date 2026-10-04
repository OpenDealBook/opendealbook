import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@odb/supabase';

type Client = SupabaseClient<Database>;

const TEMPERATURE = 0;

export interface ResolvedLlmEndpoint {
  id: string;
  chatModel: string;
  baseUrl: string;
  apiKey: string;
}

export async function resolveLlmEndpoint(
  client: Client,
  accountId: string,
): Promise<ResolvedLlmEndpoint | null> {
  const { data: endpoint, error } = await client
    .from('llm_endpoint')
    .select('id, chat_model, base_url, api_key_secret_ref')
    .eq('account_id', accountId)
    .single();

  if (error || !endpoint || !endpoint.chat_model || !endpoint.base_url) {
    return null;
  }

  const apiKey = endpoint.api_key_secret_ref
    ? process.env[endpoint.api_key_secret_ref]
    : undefined;

  if (!apiKey) {
    return null;
  }

  return {
    id: endpoint.id,
    chatModel: endpoint.chat_model,
    baseUrl: endpoint.base_url,
    apiKey,
  };
}

export async function callStructuredChat(
  endpoint: ResolvedLlmEndpoint,
  system: string,
  prompt: string,
): Promise<string> {
  const response = await fetch(`${endpoint.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${endpoint.apiKey}`,
    },
    body: JSON.stringify({
      model: endpoint.chatModel,
      temperature: TEMPERATURE,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
    }),
  });

  const payload = (await response.json()) as {
    choices: { message: { content: string } }[];
  };

  return payload.choices[0]!.message.content;
}

export interface StructuredGenerateInput<T> {
  accountId: string;
  system: string;
  prompt: string;
  parse: (raw: unknown) => T;
}

export async function generateStructured<T>(
  client: Client,
  { accountId, system, prompt, parse }: StructuredGenerateInput<T>,
): Promise<T> {
  const endpoint = await resolveLlmEndpoint(client, accountId);

  if (!endpoint) {
    throw new Error(`no llm_endpoint configured for account ${accountId}`);
  }

  const content = await callStructuredChat(endpoint, system, prompt);

  return parse(JSON.parse(content));
}
