import type { User } from '@supabase/supabase-js';

import type { ZodType } from 'zod';

import { enhanceAction } from '@odb/next/actions';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { isSignedIn } from '../members/room-gate';
import { type ActionResult, Refusal, SESSION_ENDED } from './refusal';

export function refusableAction<Input, Value>(
  fn: (input: Input, user: User) => Promise<Value>,
  config: { auth?: boolean; schema: ZodType<Input> },
): (input: Input) => Promise<ActionResult<Value>> {
  const run = enhanceAction(
    async (input: Input, user): Promise<ActionResult<Value>> => {
      try {
        return { ok: true, value: await fn(input, user) };
      } catch (error) {
        if (error instanceof Refusal) {
          return { ok: false, refusal: error.message };
        }

        throw error;
      }
    },
    config,
  );

  return async (input) => {
    const parsed = config.schema.safeParse(input);

    if (!parsed.success) {
      return { ok: false, refusal: parsed.error.issues[0]!.message };
    }

    if (
      config.auth !== false &&
      !(await isSignedIn(getSupabaseServerClient()))
    ) {
      return { ok: false, refusal: SESSION_ENDED };
    }

    return run(input);
  };
}
