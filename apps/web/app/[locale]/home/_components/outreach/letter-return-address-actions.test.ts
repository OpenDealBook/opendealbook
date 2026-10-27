import { beforeEach, describe, expect, it, vi } from 'vitest';

const TEAM_ID = '00000000-0000-4000-8000-000000000001';
const ADDRESS = {
  name: 'Harbor Acquisitions',
  addressLine1: '9 Elm St',
  city: 'Austin',
  state: 'TX',
  postalCode: '78702',
};

const world = vi.hoisted(() => ({
  events: [] as string[],
  canManageDeals: true,
  hasSettingRow: true,
}));

vi.mock('@odb/next/actions', () => ({
  enhanceAction:
    (fn: (input: unknown, user: { id: string }) => Promise<unknown>) =>
    (input: unknown) =>
      fn(input, { id: 'user-1' }),
}));

function resolved<Value>(value: Value) {
  return {
    then: (resolve: (settled: Value) => unknown) => resolve(value),
    throwOnError: async () => value,
  };
}

function described(row: Record<string, unknown>) {
  return Object.entries(row)
    .map(([column, value]) => `${column}=${value}`)
    .join(' ');
}

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({
    from: (table: string) => ({
      update: (patch: Record<string, unknown>) => ({
        eq: (column: string, value: string) => ({
          select: () => {
            if (!world.canManageDeals || !world.hasSettingRow) {
              return resolved({ data: [], error: null });
            }
            world.events.push(`update ${table} ${described(patch)} where ${column}=${value}`);
            return resolved({ data: [{ account_id: value }], error: null });
          },
        }),
      }),
      insert: (row: Record<string, unknown>) => {
        if (!world.canManageDeals) {
          return resolved({ data: null, error: { code: '42501', message: 'row-level security' } });
        }
        world.events.push(`insert ${table} ${described(row)}`);
        return resolved({ data: null, error: null });
      },
    }),
  }),
}));

const { saveLetterReturnAddressAction } = await import('./letter-return-address-actions');

const SAVED_COLUMNS =
  'letter_return_name=Harbor Acquisitions letter_return_address_line1=9 Elm St letter_return_city=Austin letter_return_state=TX letter_return_postal_code=78702';

beforeEach(() => {
  world.events = [];
  world.canManageDeals = true;
  world.hasSettingRow = true;
});

describe('saving the letter return address', () => {
  it("saves the team's return address", async () => {
    const result = await saveLetterReturnAddressAction({ accountId: TEAM_ID, ...ADDRESS });

    expect(result).toEqual({ ok: true, value: undefined });
    expect(world.events).toEqual([`update outreach_setting ${SAVED_COLUMNS} where account_id=${TEAM_ID}`]);
  });

  it("creates a team's outreach settings with the page defaults and the address", async () => {
    world.hasSettingRow = false;

    await saveLetterReturnAddressAction({ accountId: TEAM_ID, ...ADDRESS });

    expect(world.events).toEqual([
      `insert outreach_setting account_id=${TEAM_ID} daily_cap=25 max_touches=3 ${SAVED_COLUMNS}`,
    ]);
  });

  it('refuses members who cannot manage deals', async () => {
    world.canManageDeals = false;

    const result = await saveLetterReturnAddressAction({ accountId: TEAM_ID, ...ADDRESS });

    expect(result).toEqual({ ok: false, refusal: 'Changing the return address needs deals.manage' });
    expect(world.events).toEqual([]);
  });
});
