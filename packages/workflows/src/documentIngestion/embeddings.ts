export const EMBEDDING_DIMENSIONS = 1536;

export interface EmbeddingEndpoint {
  baseUrl: string;
  model: string;
  apiKey: string;
}

interface EmbeddingResponse {
  data: { index: number; embedding: number[] }[];
}

export async function embedTexts(
  endpoint: EmbeddingEndpoint,
  inputs: string[],
): Promise<number[][]> {
  const response = await fetch(`${endpoint.baseUrl}/embeddings`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${endpoint.apiKey}`,
    },
    body: JSON.stringify({ model: endpoint.model, input: inputs }),
  });

  const payload = (await response.json()) as EmbeddingResponse;
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

  return vectors;
}
