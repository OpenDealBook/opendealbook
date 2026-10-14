import { AuthSessionMissingError } from '@supabase/supabase-js';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const session = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({
    auth: {
      getUser: async () =>
        session.userId
          ? { data: { user: { id: session.userId } }, error: null }
          : { data: { user: null }, error: new AuthSessionMissingError() },
    },
  }),
}));

import { refusableAction } from './refusable-action';
import { Refusal } from './refusal';

const schema = z.object({
  title: z.string().trim().min(1, 'An ask needs a title'),
  roomId: z.uuid('Choose a room'),
});

const validInput = {
  title: ' Rent roll ',
  roomId: '7d0f2c0e-6c0f-4f43-9c53-0d7a4c1f1a11',
};

describe('refusableAction', () => {
  it('returns what the action produced, from the parsed input', async () => {
    const action = refusableAction(async (input) => input.title, {
      auth: false,
      schema,
    });

    expect(await action(validInput)).toEqual({ ok: true, value: 'Rent roll' });
  });

  it('turns a thrown Refusal into a refusal the caller can show', async () => {
    const action = refusableAction(
      async () => {
        throw new Refusal('This room is already closed');
      },
      { auth: false, schema },
    );

    expect(await action(validInput)).toEqual({
      ok: false,
      refusal: 'This room is already closed',
    });
  });

  it('turns invalid input into the first problem as plain text', async () => {
    const action = refusableAction(async () => 'never reached', {
      auth: false,
      schema,
    });

    expect(await action({ title: '  ', roomId: 'not-a-uuid' })).toEqual({
      ok: false,
      refusal: 'An ask needs a title',
    });
  });

  it('lets an ordinary error crash the action', async () => {
    const action = refusableAction(
      async () => {
        throw new TypeError('rooms is not iterable');
      },
      { auth: false, schema },
    );

    await expect(action(validInput)).rejects.toThrow('rooms is not iterable');
  });
});

describe('refusableAction for a signed-in person', () => {
  beforeEach(() => {
    session.userId = null;
  });

  it('refuses in plain words when the session has ended, without running the action', async () => {
    let ran = false;
    const action = refusableAction(
      async () => {
        ran = true;
      },
      { schema },
    );

    expect(await action(validInput)).toEqual({
      ok: false,
      refusal: 'Your session has ended. Sign in again.',
    });
    expect(ran).toBe(false);
  });

  it('runs the action as the signed-in person', async () => {
    session.userId = 'user-1';
    const action = refusableAction(async (_input, user) => user.id, { schema });

    expect(await action(validInput)).toEqual({ ok: true, value: 'user-1' });
  });
});
