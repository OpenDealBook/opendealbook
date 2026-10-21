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
    is(column: keyof Row, value: null) {
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

import {
  rememberDetectedTimezoneAction,
  updatePersonalTimezoneAction,
} from './personal-account-actions';

type Run = (
  data: { timezone: string },
  user: { id: string },
) => Promise<unknown>;

const remember = rememberDetectedTimezoneAction as unknown as Run;
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
      {
        primary_owner_user_id: 'user-2',
        is_personal_account: true,
        timezone: null,
      },
    ];
  });

  it('stores the browser zone when the person has none', async () => {
    await remember({ timezone: 'America/Chicago' }, { id: 'user-1' });

    expect(personal('user-1').timezone).toBe('America/Chicago');
    expect(personal('user-2').timezone).toBeNull();
    expect(db.rows[1]!.timezone).toBeNull();
  });

  it('keeps a zone the person already has', async () => {
    personal('user-1').timezone = 'Europe/Lisbon';

    await remember({ timezone: 'America/Chicago' }, { id: 'user-1' });

    expect(personal('user-1').timezone).toBe('Europe/Lisbon');
  });

  it('replaces the zone with the one the person picks on their profile', async () => {
    personal('user-1').timezone = 'Europe/Lisbon';

    await choose({ timezone: 'Asia/Tokyo' }, { id: 'user-1' });

    expect(personal('user-1').timezone).toBe('Asia/Tokyo');
    expect(db.rows[1]!.timezone).toBeNull();
  });
});
