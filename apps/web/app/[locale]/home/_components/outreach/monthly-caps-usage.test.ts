import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const TEAM_ID = 'team-1';
const OTHER_TEAM_ID = 'team-2';

type Row = { account_id: string; created_at: string; status?: string };

const world = vi.hoisted(() => ({
  setting: null as null | {
    letter_monthly_cap: number;
    lookup_monthly_cap: number;
    ai_monthly_cap: number;
  },
  rows: {} as Record<string, Row[]>,
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: (_column: string, accountId: string) => ({
          maybeSingle: async () => ({ data: world.setting, error: null }),
          gte: (_createdAt: string, since: string) => ({
            throwOnError: async () => ({
              count: (world.rows[table] ?? []).filter(
                (row) =>
                  row.account_id === accountId &&
                  Date.parse(row.created_at) >= Date.parse(since),
              ).length,
            }),
          }),
        }),
      }),
    }),
  }),
}));

const { loadMonthlyCaps } = await import('./monthly-caps-usage');

function row(created_at: string, account_id = TEAM_ID, status?: string): Row {
  return { account_id, created_at, status };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-21T12:00:00Z'));
  world.setting = {
    letter_monthly_cap: 40,
    lookup_monthly_cap: 200,
    ai_monthly_cap: 1000,
  };
  world.rows = {};
});

afterEach(() => {
  vi.useRealTimers();
});

describe("this month's caps and usage", () => {
  it("counts each kind's rows since the start of the UTC month, failed letters included", async () => {
    world.rows = {
      outreach_letter: [
        row('2026-10-01T00:00:00Z'),
        row('2026-10-20T09:00:00Z', TEAM_ID, 'failed'),
        row('2026-09-30T23:59:59Z'),
        row('2026-10-10T00:00:00Z', OTHER_TEAM_ID),
      ],
      paid_lookup: [
        row('2026-10-02T00:00:00Z'),
        row('2026-10-03T00:00:00Z'),
        row('2026-10-04T00:00:00Z'),
        row('2026-09-15T00:00:00Z'),
      ],
      ai_call_log: [row('2026-10-21T11:59:00Z'), row('2026-09-30T23:00:00Z')],
    };

    expect(await loadMonthlyCaps(TEAM_ID)).toEqual({
      letters: { cap: 40, used: 2 },
      lookups: { cap: 200, used: 3 },
      ai: { cap: 1000, used: 1 },
    });
  });

  it('treats every cap as 0 for a team with no outreach settings', async () => {
    world.setting = null;

    expect(await loadMonthlyCaps(TEAM_ID)).toEqual({
      letters: { cap: 0, used: 0 },
      lookups: { cap: 0, used: 0 },
      ai: { cap: 0, used: 0 },
    });
  });
});
