const TEMPERATURE = 0;
const MAX_TOKENS = 256;

const EXTRACTION_SYSTEM_PROMPT =
  'You extract a single dollar figure from a financial document. ' +
  'Reply with strict JSON of the form {"amount": <number>} in whole US dollars, ' +
  'or {"amount": null} when the requested figure is not present in the document.';

export interface ExtractionEndpoint {
  baseUrl: string;
  chatModel: string;
  apiKey: string;
}

export interface FigureExtraction {
  amount: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
}

export async function extractFigure(
  endpoint: ExtractionEndpoint,
  instruction: string,
  markdown: string,
): Promise<FigureExtraction> {
  const response = await fetch(`${endpoint.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${endpoint.apiKey}`,
    },
    body: JSON.stringify({
      model: endpoint.chatModel,
      temperature: TEMPERATURE,
      max_tokens: MAX_TOKENS,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
        { role: 'user', content: `${instruction}\n\nDocument:\n\n${markdown}` },
      ],
    }),
  });

  const payload = (await response.json()) as {
    choices: { message: { content: string } }[];
    usage?: { prompt_tokens: number; completion_tokens: number };
  };

  const parsed = JSON.parse(payload.choices[0]!.message.content) as {
    amount: number | null;
  };

  return {
    amount: parsed.amount,
    promptTokens: payload.usage?.prompt_tokens ?? null,
    completionTokens: payload.usage?.completion_tokens ?? null,
  };
}
