/// <reference path="../server-only.d.ts" />
import 'server-only';
import type { User } from '@supabase/supabase-js';

import { createSafeActionClient } from 'next-safe-action';
import type { ZodType } from 'zod';

import { ConsoleMonitoringService } from '@odb/monitoring';
import { getLogger } from '@odb/shared/logger';
import { getSupabaseServerClient } from '@odb/supabase/server';

interface EnhanceActionConfig<Input> {
  auth?: boolean;
  schema?: ZodType<Input>;
  captcha?: boolean;
}

const monitoring = new ConsoleMonitoringService();

const actionClient = createSafeActionClient({
  handleServerError(error) {
    getLogger().error({ err: error }, 'Server action failed');
    monitoring.captureException(error);

    return error.message;
  },
});

export function enhanceAction<Input, Output>(
  fn: (input: Input, user: User) => Promise<Output>,
  config: EnhanceActionConfig<Input> = {},
): (input: Input) => Promise<Output> {
  return async (input: Input) => {
    const run = actionClient.action(async () => {
      const data = config.schema ? config.schema.parse(input) : input;
      const user = config.auth === false ? undefined : await resolveUser();

      return fn(data, user as User);
    });

    const result = await run();

    if (result?.serverError) {
      throw new Error(result.serverError);
    }

    return result?.data as Output;
  };
}

async function resolveUser(): Promise<User> {
  const { data } = await getSupabaseServerClient().auth.getUser();

  if (!data.user) {
    throw new Error('Authentication required');
  }

  return data.user;
}
