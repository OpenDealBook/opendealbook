import { postToAiProvider } from '../builder/aiClient';
import { estimatedUsage, type Usage } from '../builder/modelPrices';

export const EMBEDDING_DIMENSIONS = 1536;

export interface EmbeddingEndpoint {
  baseUrl: string;
  model: string;
  apiKey: string;
}

interface EmbeddingResponse {
  data: { index: number; embedding: number[] }[];
  usage?: { prompt_tokens: number };
}

export async function embedTexts(
  endpoint: EmbeddingEndpoint,
  inputs: string[],
): Promise<{ vectors: number[][]; usage: Usage }> {
  const payload = (await postToAiProvider(
    `${endpoint.baseUrl}/embeddings`,
    { authorization: `Bearer ${endpoint.apiKey}` },
    { model: endpoint.model, input: inputs },
  )) as EmbeddingResponse;
  const vectors = payload.data
    .slice()
    .sort((left, right) => left.index - right.index)
    .map((row) => row.embedding);

  for (const vector of vectors) {
    if (vector.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(
        `embedding model ${endpoint.model} returned ${vector.length} dimensions; document_chunk requires ${EMBEDDING_DIMENSIONS}`,
      );
    }
  }

  return {
    vectors,
    usage: payload.usage
      ? {
          inputTokens: payload.usage.prompt_tokens,
          cachedInputTokens: 0,
          cacheWriteTokens: 0,
          outputTokens: 0,
        }
      : estimatedUsage(inputs.join(''), 0),
  };
}
