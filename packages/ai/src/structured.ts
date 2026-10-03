import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@odb/supabase';

type Client = SupabaseClient<Database>;

const TEMPERATURE = 0;

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
  const { data: endpoint, error } = await client
    .from('llm_endpoint')
    .select('id, chat_model, base_url, api_key_secret_ref')
    .eq('account_id', accountId)
    .single();

  if (error || !endpoint) {
    throw new Error(`no llm_endpoint configured for account ${accountId}`);
  }

  if (!endpoint.chat_model) {
    throw new Error(`llm_endpoint ${endpoint.id} has no chat_model`);
  }

  if (!endpoint.base_url) {
    throw new Error(`llm_endpoint ${endpoint.id} has no base_url`);
  }

  const apiKey = endpoint.api_key_secret_ref
    ? process.env[endpoint.api_key_secret_ref]
    : undefined;

  if (!apiKey) {
    throw new Error(
      `llm_endpoint ${endpoint.id} api key is not present in the environment`,
    );
  }

  const response = await fetch(`${endpoint.base_url}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: endpoint.chat_model,
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

  return parse(JSON.parse(payload.choices[0]!.message.content));
}
