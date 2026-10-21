import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = {
  primary_owner_user_id: string;
  is_personal_account: boolean;
  phone: string | null;
  phone_asked_at: string | null;
};

const db = vi.hoisted(() => ({ rows: [] as Row[] }));

function accountsTable() {
  const filters: ((row: Row) => boolean)[] = [];
  let change: Partial<Row> = {};

  const builder = {
    update(values: Partial<Row>) {
      change = values;
      return builder;
    },
    eq(column: keyof Row, value: unknown) {
      filters.push((row) => row[column] === value);
      return builder;
    },
    async throwOnError() {
      db.rows
        .filter((row) => filters.every((matches) => matches(row)))
        .forEach((row) => Object.assign(row, change));
      return { data: null, error: null };
    },
  };

  return builder;
}

vi.mock('@odb/next/actions', () => ({
  enhanceAction:
    (
      fn: (data: unknown, user: unknown) => unknown,
      config: { schema: { parse: (input: unknown) => unknown } },
    ) =>
    async (data: unknown, user: unknown) =>
      fn(config.schema.parse(data), user),
}));
vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({ from: () => accountsTable() }),
  getSupabaseServerAdminClient: () => ({}),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

import {
  answerPhonePrompt,
  skipPhonePrompt,
  updatePersonalPhoneAction,
} from './personal-account-actions';

type Run = (data: unknown, user: { id: string }) => Promise<unknown>;

const save = updatePersonalPhoneAction as unknown as Run;
const answer = answerPhonePrompt as unknown as Run;
const skip = skipPhonePrompt as unknown as Run;
const me = { id: 'user-1' };

function personal() {
  return db.rows[0]!;
}

describe('a person phone', () => {
  beforeEach(() => {
    db.rows = [
      {
        primary_owner_user_id: 'user-1',
        is_personal_account: true,
        phone: null,
        phone_asked_at: null,
      },
      {
        primary_owner_user_id: 'user-1',
        is_personal_account: false,
        phone: null,
        phone_asked_at: null,
      },
    ];
  });

  it('saves the phone from the profile, trimmed', async () => {
    await save({ phone: '  +1 555 0100 ' }, me);

    expect(personal().phone).toBe('+1 555 0100');
    expect(db.rows[1]!.phone).toBeNull();
  });

  it('clears the phone when the profile field is blank', async () => {
    personal().phone = '+1 555 0100';

    await save({ phone: '   ' }, me);

    expect(personal().phone).toBeNull();
  });

  it('refuses a phone longer than 50 characters', async () => {
    await expect(save({ phone: '5'.repeat(51) }, me)).rejects.toThrow();
    expect(personal().phone).toBeNull();
  });

  it('records an answer to the prompt so it is not asked again', async () => {
    await answer({ phone: '+1 555 0100' }, me);

    expect(personal().phone).toBe('+1 555 0100');
    expect(personal().phone_asked_at).not.toBeNull();
  });

  it('records a skipped prompt without touching the phone', async () => {
    personal().phone = '+1 555 0100';

    await skip({}, me);

    expect(personal().phone).toBe('+1 555 0100');
    expect(personal().phone_asked_at).not.toBeNull();
  });
});
