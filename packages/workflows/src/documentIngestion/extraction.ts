import { aiJson } from '../builder/aiClient';
import { completeMetered, type TeamAi } from '../builder/teamAiKey';

const TEMPERATURE = 0;
const MAX_TOKENS = 256;

const EXTRACTION_SYSTEM_PROMPT =
  'You extract a single dollar figure from a financial document. ' +
  'Reply with strict JSON of the form {"amount": <number>} in whole US dollars, ' +
  'or {"amount": null} when the requested figure is not present in the document.';

export async function extractFigure(
  ai: TeamAi,
  dealId: string,
  instruction: string,
  markdown: string,
): Promise<number | null> {
  const text = await completeMetered(
    ai,
    { dealId },
    `${instruction}\n\nDocument:\n\n${markdown}`,
    { system: EXTRACTION_SYSTEM_PROMPT, json: true, temperature: TEMPERATURE, maxTokens: MAX_TOKENS },
  );

  return (aiJson(text) as { amount: number | null }).amount;
}
