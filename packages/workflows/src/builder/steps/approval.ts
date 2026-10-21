import { z } from 'zod';

import { NODE_CONFIG_SCHEMAS } from '../graph';
import { defineStep } from '../step';

export const approval = defineStep({
  type: 'approval',
  runOnce: false,
  configSchema: NODE_CONFIG_SCHEMAS.approval,
  inputSchema: z.object({}),
  outputSchema: z.object({ prompt: z.string() }),
  async run({ config }) {
    return { prompt: config.prompt };
  },
});
