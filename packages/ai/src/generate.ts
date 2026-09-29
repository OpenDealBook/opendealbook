import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@odb/supabase';

type Client = SupabaseClient<Database>;

const DEFAULT_MATCH_COUNT = 8;
const TEMPERATURE = 0.1;
const MAX_TOKENS = 1024;

const SYSTEM_PROMPT =
  'You answer questions about a specific deal using only the provided document excerpts. ' +
  'Cite the excerpt numbers you rely on. If the excerpts do not contain the answer, say so.';

export interface DealQuestionInput {
  dealId: string;
  question: string;
  matchCount?: number;
}

export interface Citation {
  chunkId: string;
}

export interface DealQuestionResult {
  answer: string;
  citations: Citation[];
}

interface RetrievedChunk {
  id: string;
  content: string;
  distance: number;
}

async function embedQuestion(
  baseUrl: string,
  model: string,
  apiKey: string,
  question: string,
): Promise<number[]> {
  const response = await fetch(`${baseUrl}/embeddings`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, input: [question] }),
  });

  const payload = (await response.json()) as {
    data: { index: number; embedding: number[] }[];
  };

  return payload.data[0]!.embedding;
}

function buildMessages(question: string, chunks: RetrievedChunk[]) {
  const context = chunks
    .map((chunk, index) => `Excerpt ${index + 1} (id ${chunk.id}):\n${chunk.content}`)
    .join('\n\n');

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `Document excerpts:\n\n${context}\n\nQuestion: ${question}` },
  ];
}

async function generateAnswer(
  baseUrl: string,
  chatModel: string,
  apiKey: string,
  messages: ReturnType<typeof buildMessages>,
): Promise<{
  answer: string;
  promptTokens: number | null;
  completionTokens: number | null;
}> {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: chatModel,
      temperature: TEMPERATURE,
      max_tokens: MAX_TOKENS,
      messages,
    }),
  });

  const payload = (await response.json()) as {
    choices: { message: { content: string } }[];
    usage?: { prompt_tokens: number; completion_tokens: number };
  };

  return {
    answer: payload.choices[0]!.message.content,
    promptTokens: payload.usage?.prompt_tokens ?? null,
    completionTokens: payload.usage?.completion_tokens ?? null,
  };
}

export async function answerDealQuestion(
  client: Client,
  { dealId, question, matchCount }: DealQuestionInput,
  writer: Client,
): Promise<DealQuestionResult> {
  const { data: deal, error: dealError } = await client
    .from('deal')
    .select('account_id')
    .eq('id', dealId)
    .single();

  if (dealError || !deal) {
    throw new Error(`deal ${dealId} is not accessible`);
  }

  const accountId = deal.account_id;

  const { data: endpoint, error: endpointError } = await client
    .from('llm_endpoint')
    .select('id, model, chat_model, base_url, api_key_secret_ref')
    .eq('account_id', accountId)
    .single();

  if (endpointError || !endpoint) {
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

  const embedding = await embedQuestion(
    endpoint.base_url,
    endpoint.model,
    apiKey,
    question,
  );

  const { data: chunks, error: retrievalError } = await client.rpc(
    'match_document_chunks',
    {
      p_deal_id: dealId,
      p_embedding: JSON.stringify(embedding),
      p_match_count: matchCount ?? DEFAULT_MATCH_COUNT,
    },
  );

  if (retrievalError) {
    throw retrievalError;
  }

  const retrieved = (chunks ?? []) as RetrievedChunk[];

  const { answer, promptTokens, completionTokens } = await generateAnswer(
    endpoint.base_url,
    endpoint.chat_model,
    apiKey,
    buildMessages(question, retrieved),
  );

  await writer.from('ai_call_log').insert({
    account_id: accountId,
    endpoint_id: endpoint.id,
    deal_id: dealId,
    model: endpoint.chat_model,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
  });

  return {
    answer,
    citations: retrieved.map((chunk) => ({ chunkId: chunk.id })),
  };
}
