import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = {
  primary_owner_user_id: string;
  is_personal_account: boolean;
  timezone: string | null;
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
  enhanceAction: (fn: unknown) => fn,
}));
vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({ from: () => accountsTable() }),
  getSupabaseServerAdminClient: () => ({}),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

import { updatePersonalTimezoneAction } from './personal-account-actions';

type Run = (
  data: { timezone: string },
  user: { id: string },
) => Promise<unknown>;

const choose = updatePersonalTimezoneAction as unknown as Run;

function personal(userId: string) {
  return db.rows.find(
    (row) => row.primary_owner_user_id === userId && row.is_personal_account,
  )!;
}

describe('a person time zone', () => {
  beforeEach(() => {
    db.rows = [
      {
        primary_owner_user_id: 'user-1',
        is_personal_account: true,
        timezone: null,
      },
      {
        primary_owner_user_id: 'user-1',
        is_personal_account: false,
        timezone: null,
      },
    ];
  });

  it('replaces the zone with the one the person picks on their profile', async () => {
    personal('user-1').timezone = 'Europe/Lisbon';

    await choose({ timezone: 'Asia/Tokyo' }, { id: 'user-1' });

    expect(personal('user-1').timezone).toBe('Asia/Tokyo');
    expect(db.rows[1]!.timezone).toBeNull();
  });

  it('keeps the zone when the pick is one the app cannot format', async () => {
    personal('user-1').timezone = 'Europe/Lisbon';

    await expect(
      choose({ timezone: 'posix/America/New_York' }, { id: 'user-1' }),
    ).rejects.toThrow(
      "posix/America/New_York isn't a supported time zone; pick another",
    );

    expect(personal('user-1').timezone).toBe('Europe/Lisbon');
  });
});
