import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const TEAM_ID = 'team-1';
const OTHER_TEAM_ID = 'team-2';

type Row = { account_id: string; created_at: string; status?: string };

const world = vi.hoisted(() => ({
  setting: null as null | {
    letter_monthly_cap: number;
    lookup_monthly_cap: number;
    ai_monthly_credit_cap: number;
  },
  rows: {} as Record<string, Row[]>,
  aiCreditsUsed: {} as Record<string, number>,
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({
    rpc: (name: string, args: { p_account_id: string }) => ({
      throwOnError: async () => ({
        data:
          name === 'ai_credits_used_this_month'
            ? (world.aiCreditsUsed[args.p_account_id] ?? 0)
            : null,
      }),
    }),
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
    ai_monthly_credit_cap: 1000,
  };
  world.rows = {};
  world.aiCreditsUsed = {};
});

afterEach(() => {
  vi.useRealTimers();
});

describe("this month's caps and usage", () => {
  it("counts letters and lookups since the start of the UTC month, failed letters included, and sums this month's AI credits", async () => {
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
    };
    world.aiCreditsUsed = { [TEAM_ID]: 311.2, [OTHER_TEAM_ID]: 50 };

    expect(await loadMonthlyCaps(TEAM_ID)).toEqual({
      letters: { cap: 40, used: 2 },
      lookups: { cap: 200, used: 3 },
      ai: { cap: 1000, used: 311.2, resetsAt: '2026-11-01T00:00:00.000Z' },
    });
  });

  it('treats every cap as 0 for a team with no outreach settings', async () => {
    world.setting = null;

    expect(await loadMonthlyCaps(TEAM_ID)).toEqual({
      letters: { cap: 0, used: 0 },
      lookups: { cap: 0, used: 0 },
      ai: { cap: 0, used: 0, resetsAt: '2026-11-01T00:00:00.000Z' },
    });
  });
});
