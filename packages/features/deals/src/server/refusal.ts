import type { User } from '@supabase/supabase-js';

import type { ZodType } from 'zod';

import { enhanceAction } from '@odb/next/actions';

export class Refusal extends Error {}

export type ActionResult<Value> =
  | { ok: true; value: Value }
  | { ok: false; refusal: string };

export function refusableAction<Input, Value>(
  fn: (input: Input, user: User) => Promise<Value>,
  schema: ZodType<Input>,
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
    { auth: true, schema },
  );

  return async (input) => {
    const parsed = schema.safeParse(input);

    return parsed.success
      ? run(input)
      : { ok: false, refusal: parsed.error.issues[0]!.message };
  };
}
