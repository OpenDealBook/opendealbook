import { ApplicationFailure } from '@temporalio/common';

import { completeMetered, CONNECT_AI_PROVIDER, resolveTeamAi } from './teamAiKey';

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
  const ai = await resolveTeamAi(args.accountId, 'chat');
  if (!ai) {
    throw ApplicationFailure.nonRetryable(args.noProviderMessage ?? CONNECT_AI_PROVIDER);
  }

  args.signal?.throwIfAborted();
  const text = await completeMetered(
    ai,
    { firmId: args.firmId, dealId: args.dealId, signal: args.signal },
    args.prompt,
  );

  return { text, endpointId: ai.endpointId, model: ai.model };
}
