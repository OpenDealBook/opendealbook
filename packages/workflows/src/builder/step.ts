import { ApplicationFailure } from '@temporalio/common';
import type { z } from 'zod';

import type { StepIo, StepTypeName } from './graph';

export interface StepContext {
  accountId: string;
  runId: string;
  idempotencyKey: string;
}

export interface StepDefinition<
  Config extends StepIo,
  Input extends StepIo,
  Output extends StepIo,
> {
  type: StepTypeName;
  runOnce: boolean;
  configSchema: z.ZodType<Config>;
  inputSchema: z.ZodType<Input>;
  outputSchema: z.ZodType<Output>;
  run(args: { context: StepContext; config: Config; input: Input }): Promise<Output>;
}

export function defineStep<
  Config extends StepIo,
  Input extends StepIo,
  Output extends StepIo,
>(definition: StepDefinition<Config, Input, Output>) {
  async function execute(args: {
    context: StepContext;
    config: unknown;
    input: unknown;
  }): Promise<StepIo> {
    const config = definition.configSchema.safeParse(args.config);
    if (!config.success) {
      throw ApplicationFailure.nonRetryable(config.error.message);
    }
    return definition.outputSchema.parse(
      await definition.run({
        context: args.context,
        config: config.data,
        input: definition.inputSchema.parse(args.input),
      }),
    );
  }

  return {
    ...definition,
    execute: definition.runOnce
      ? (args: Parameters<typeof execute>[0]) =>
          execute(args).catch((error: Error) => {
            throw ApplicationFailure.nonRetryable(error.message);
          })
      : execute,
  };
}
