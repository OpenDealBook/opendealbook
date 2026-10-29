import {
  aiJson,
  CapReached,
  CONNECT_AI_PROVIDER,
  completeMetered,
  resolveScopedTeamAi,
} from '@odb/workflows/team-ai';

import type { AiScope } from './scope';

const TEMPERATURE = 0;

export interface StructuredGenerateInput<T> {
  scope: AiScope;
  system: string;
  prompt: string;
  parse: (raw: unknown) => T;
}

export type Structured<T> = { ok: true; value: T } | { ok: false; reason: string };

export async function generateStructured<T>({
  scope,
  system,
  prompt,
  parse,
}: StructuredGenerateInput<T>): Promise<Structured<T>> {
  const ai = await resolveScopedTeamAi(scope, 'chat');

  if (!ai) {
    return { ok: false, reason: CONNECT_AI_PROVIDER };
  }

  try {
    const content = await completeMetered(
      ai,
      { dealId: scope.dealId },
      prompt,
      { system, json: true, temperature: TEMPERATURE },
    );
    return { ok: true, value: parse(aiJson(content)) };
  } catch (error) {
    if (error instanceof CapReached) {
      return { ok: false, reason: error.message };
    }
    throw error;
  }
}
