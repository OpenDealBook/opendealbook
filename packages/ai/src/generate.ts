import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@odb/supabase';
import {
  ADD_EMBEDDING_MODEL,
  completeMetered,
  embedTexts,
  meterTeamAiCall,
  resolveScopedTeamAi,
  TeamAiNotConnected,
} from '@odb/workflows/team-ai';

import type { DealAiScope } from './scope';

type Client = SupabaseClient<Database>;

const DEFAULT_MATCH_COUNT = 8;
const TEMPERATURE = 0.1;
const MAX_TOKENS = 1024;

const SYSTEM_PROMPT =
  'You answer questions about a specific deal using only the provided document excerpts. ' +
  'Cite the excerpt numbers you rely on. If the excerpts do not contain the answer, say so.';

export interface DealQuestionInput {
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

function userMessage(question: string, chunks: RetrievedChunk[]): string {
  const context = chunks
    .map((chunk, index) => `Excerpt ${index + 1} (id ${chunk.id}):\n${chunk.content}`)
    .join('\n\n');

  return `Document excerpts:\n\n${context}\n\nQuestion: ${question}`;
}

export async function answerDealQuestion(
  client: Client,
  scope: DealAiScope,
  { question, matchCount }: DealQuestionInput,
): Promise<DealQuestionResult> {
  const [chat, embedder] = await Promise.all([
    resolveScopedTeamAi(scope, 'chat'),
    resolveScopedTeamAi(scope, 'embedding'),
  ]);

  if (!chat) {
    throw new TeamAiNotConnected();
  }

  if (!embedder) {
    throw new TeamAiNotConnected(ADD_EMBEDDING_MODEL);
  }

  if (embedder.provider === 'anthropic') {
    throw new TeamAiNotConnected(
      'Anthropic has no embeddings API; use an OpenAI-compatible provider for document search',
    );
  }

  const [embedding] = await meterTeamAiCall(embedder, { dealId: scope.dealId }, async () => ({
    result: await embedTexts(embedder, [question]),
    promptTokens: null,
    completionTokens: null,
  }));

  const { data: chunks, error: retrievalError } = await client.rpc(
    'match_document_chunks',
    {
      p_deal_id: scope.dealId,
      p_embedding: JSON.stringify(embedding),
      p_match_count: matchCount ?? DEFAULT_MATCH_COUNT,
    },
  );

  if (retrievalError) {
    throw retrievalError;
  }

  const retrieved = (chunks ?? []) as RetrievedChunk[];

  const answer = await completeMetered(
    chat,
    { dealId: scope.dealId },
    userMessage(question, retrieved),
    { system: SYSTEM_PROMPT, temperature: TEMPERATURE, maxTokens: MAX_TOKENS },
  );

  return {
    answer,
    citations: retrieved.map((chunk) => ({ chunkId: chunk.id })),
  };
}
