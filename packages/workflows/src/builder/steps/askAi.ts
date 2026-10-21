import { ApplicationFailure } from '@temporalio/common';
import { z } from 'zod';

import { NODE_CONFIG_SCHEMAS } from '../graph';
import { defineStep } from '../step';
import { askTeamAi, parsedJson } from '../teamAi';

export const askAi = defineStep({
  type: 'ask_ai',
  runOnce: false,
  configSchema: NODE_CONFIG_SCHEMAS.ask_ai,
  inputSchema: z.object({}),
  outputSchema: z.union([z.object({ text: z.string() }), z.object({ json: z.json() })]),
  async run({ context, config }) {
    const { text } = await askTeamAi({
      accountId: context.accountId,
      prompt: config.prompt,
      signal: context.signal,
    });
    if (config.output === 'text') {
      return { text };
    }
    const json = z.json().safeParse(parsedJson(text));
    if (!json.success) {
      throw ApplicationFailure.nonRetryable('The AI did not answer with valid JSON');
    }
    return { json: json.data };
  },
});
