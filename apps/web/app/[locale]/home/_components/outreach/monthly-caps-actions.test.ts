import { beforeEach, describe, expect, it, vi } from 'vitest';

const TEAM_ID = '00000000-0000-4000-8000-000000000001';
const RESUME_STUCK = "Saved, but paused runs couldn't be resumed; try again";
const CAPS = { letterMonthlyCap: 40, lookupMonthlyCap: 200, aiMonthlyCap: 1000 };

const world = vi.hoisted(() => ({
  events: [] as string[],
  canManageDeals: true,
  hasSettingRow: true,
  resumeFails: false,
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

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({
    rpc: (
      name: string,
      args: { user_id: string; account_id: string; permission_name: string },
    ) =>
      resolved({
        data:
          name === 'has_permission' &&
          args.user_id === 'user-1' &&
          args.account_id === TEAM_ID &&
          args.permission_name === 'deals.manage' &&
          world.canManageDeals,
        error: null,
      }),
    from: (table: string) => ({
      update: (patch: Record<string, number>) => ({
        eq: (column: string, value: string) => ({
          select: () => {
            if (!world.canManageDeals || !world.hasSettingRow) {
              return resolved({ data: [], error: null });
            }
            world.events.push(
              `update ${table} letters=${patch.letter_monthly_cap} lookups=${patch.lookup_monthly_cap} ai=${patch.ai_monthly_cap} where ${column}=${value}`,
            );
            return resolved({ data: [{ account_id: value }], error: null });
          },
        }),
      }),
      insert: (row: Record<string, string | number>) => {
        if (!world.canManageDeals) {
          return resolved({
            data: null,
            error: {
              code: '42501',
              message:
                'new row violates row-level security policy for table "outreach_setting"',
            },
          });
        }
        world.events.push(
          `insert ${table} ${Object.entries(row)
            .map(([column, value]) => `${column}=${value}`)
            .join(' ')}`,
        );
        return resolved({ data: null, error: null });
      },
    }),
  }),
}));

vi.mock('@odb/workflows/builder/client', () => ({
  resumeCappedRuns: async ({ accountId }: { accountId: string }) => {
    if (world.resumeFails) {
      throw new Error('runner unreachable');
    }
    world.events.push(`resume capped runs of ${accountId}`);
  },
}));

const { saveMonthlyCapsAction, retryResumeCappedRunsAction } = await import(
  './monthly-caps-actions'
);

beforeEach(() => {
  world.events = [];
  world.canManageDeals = true;
  world.hasSettingRow = true;
  world.resumeFails = false;
});

describe('saving the monthly caps', () => {
  it("saves the team's caps, then resumes runs paused at a cap", async () => {
    const result = await saveMonthlyCapsAction({ accountId: TEAM_ID, ...CAPS });

    expect(result).toEqual({ ok: true, value: { resumeError: null } });
    expect(world.events).toEqual([
      `update outreach_setting letters=40 lookups=200 ai=1000 where account_id=${TEAM_ID}`,
      `resume capped runs of ${TEAM_ID}`,
    ]);
  });

  it('keeps the saved caps and says paused runs did not resume', async () => {
    world.resumeFails = true;

    const result = await saveMonthlyCapsAction({ accountId: TEAM_ID, ...CAPS });

    expect(result).toEqual({ ok: true, value: { resumeError: RESUME_STUCK } });
    expect(world.events).toEqual([
      `update outreach_setting letters=40 lookups=200 ai=1000 where account_id=${TEAM_ID}`,
    ]);
  });

  it('refuses members who cannot manage deals and resumes nothing', async () => {
    world.canManageDeals = false;

    const result = await saveMonthlyCapsAction({ accountId: TEAM_ID, ...CAPS });

    expect(result).toEqual({
      ok: false,
      refusal: 'Changing caps needs deals.manage',
    });
    expect(world.events).toEqual([]);
  });

  it("creates a team's outreach settings with the page defaults and the caps", async () => {
    world.hasSettingRow = false;

    const result = await saveMonthlyCapsAction({ accountId: TEAM_ID, ...CAPS });

    expect(result).toEqual({ ok: true, value: { resumeError: null } });
    expect(world.events).toEqual([
      `insert outreach_setting account_id=${TEAM_ID} daily_cap=25 max_touches=1 letter_monthly_cap=40 lookup_monthly_cap=200 ai_monthly_cap=1000`,
      `resume capped runs of ${TEAM_ID}`,
    ]);
  });

  it.each([
    { ...CAPS, letterMonthlyCap: -1 },
    { ...CAPS, lookupMonthlyCap: 100001 },
    { ...CAPS, aiMonthlyCap: 100001 },
  ])('refuses caps outside 0 to 100,000 and writes nothing (%o)', async (caps) => {
    const result = await saveMonthlyCapsAction({ accountId: TEAM_ID, ...caps });

    expect(result).toEqual({
      ok: false,
      refusal: 'Caps must be between 0 and 100,000',
    });
    expect(world.events).toEqual([]);
  });

  it('accepts caps of exactly 0 and 100,000', async () => {
    const result = await saveMonthlyCapsAction({
      accountId: TEAM_ID,
      letterMonthlyCap: 0,
      lookupMonthlyCap: 100000,
      aiMonthlyCap: 100000,
    });

    expect(result).toEqual({ ok: true, value: { resumeError: null } });
  });
});

describe('retrying the resume', () => {
  it("resumes the team's capped runs again", async () => {
    const result = await retryResumeCappedRunsAction({ accountId: TEAM_ID });

    expect(result).toEqual({ ok: true, value: { resumeError: null } });
    expect(world.events).toEqual([`resume capped runs of ${TEAM_ID}`]);
  });

  it('says paused runs still did not resume', async () => {
    world.resumeFails = true;

    const result = await retryResumeCappedRunsAction({ accountId: TEAM_ID });

    expect(result).toEqual({ ok: true, value: { resumeError: RESUME_STUCK } });
  });

  it('refuses members who cannot manage deals', async () => {
    world.canManageDeals = false;

    const result = await retryResumeCappedRunsAction({ accountId: TEAM_ID });

    expect(result).toEqual({
      ok: false,
      refusal: 'Changing caps needs deals.manage',
    });
    expect(world.events).toEqual([]);
  });
});
