import { beforeEach, describe, expect, it, vi } from 'vitest';

const TEAM_ID = '00000000-0000-4000-8000-000000000001';
const SCHEDULES_STUCK = "Saved, but schedules couldn't be updated; try again";

const world = vi.hoisted(() => ({
  events: [] as string[],
  scheduleSyncFails: false,
  someSchedulesFail: false,
  canManageSettings: true,
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
          args.permission_name === 'settings.manage' &&
          world.canManageSettings,
        error: null,
      }),
    from: (table: string) => ({
      update: (patch: { timezone: string }) => ({
        eq: (column: string, value: string) => ({
          select: () => {
            if (patch.timezone === 'America/Ciudad_Juarez') {
              return resolved({
                data: null,
                error: {
                  code: '23514',
                  message:
                    'new row for relation "accounts" violates check constraint "accounts_timezone_known"',
                },
              });
            }
            if (!world.canManageSettings) {
              return resolved({ data: [], error: null });
            }
            world.events.push(
              `update ${table} timezone=${patch.timezone} where ${column}=${value}`,
            );
            return resolved({ data: [{ id: value }], error: null });
          },
        }),
      }),
    }),
  }),
}));

vi.mock('@odb/workflows/builder/schedule', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  syncTeamSchedules: async ({ accountId }: { accountId: string }) => {
    const { SchedulesPartlyUpdated } = await importOriginal<
      typeof import('@odb/workflows/builder/schedule')
    >();
    if (world.someSchedulesFail) {
      throw new SchedulesPartlyUpdated(2, 5);
    }
    if (world.scheduleSyncFails) {
      throw new Error('scheduler unreachable');
    }
    world.events.push(`sync schedules of ${accountId}`);
  },
}));

const { updateTeamTimezoneAction, retryTeamScheduleSyncAction } = await import(
  './team-timezone-actions'
);

beforeEach(() => {
  world.events = [];
  world.scheduleSyncFails = false;
  world.someSchedulesFail = false;
  world.canManageSettings = true;
});

describe('changing the team time zone', () => {
  it("saves the team's zone, then moves its workflow schedules", async () => {
    const result = await updateTeamTimezoneAction({
      accountId: TEAM_ID,
      timezone: 'Asia/Tokyo',
    });

    expect(result).toEqual({ ok: true, value: { schedulesError: null } });
    expect(world.events).toEqual([
      `update accounts timezone=Asia/Tokyo where id=${TEAM_ID}`,
      `sync schedules of ${TEAM_ID}`,
    ]);
  });

  it('keeps the saved zone and says schedules did not move', async () => {
    world.scheduleSyncFails = true;

    const result = await updateTeamTimezoneAction({
      accountId: TEAM_ID,
      timezone: 'Asia/Tokyo',
    });

    expect(result).toEqual({
      ok: true,
      value: { schedulesError: SCHEDULES_STUCK },
    });
    expect(world.events).toEqual([
      `update accounts timezone=Asia/Tokyo where id=${TEAM_ID}`,
    ]);
  });

  it('says how many workflows kept their old schedules when only some moved', async () => {
    world.someSchedulesFail = true;

    const result = await updateTeamTimezoneAction({
      accountId: TEAM_ID,
      timezone: 'Asia/Tokyo',
    });

    expect(result).toEqual({
      ok: true,
      value: {
        schedulesError:
          "2 of 5 workflows' schedules couldn't be updated; try again",
      },
    });
  });

  it('refuses members who cannot manage settings and leaves schedules alone', async () => {
    world.canManageSettings = false;

    const result = await updateTeamTimezoneAction({
      accountId: TEAM_ID,
      timezone: 'Asia/Tokyo',
    });

    expect(result).toEqual({
      ok: false,
      refusal: 'Changing the time zone needs settings.manage',
    });
    expect(world.events).toEqual([]);
  });

  it('refuses a zone the database rejects though the app lists it, as when Node gains a zone, and leaves schedules alone', async () => {
    const result = await updateTeamTimezoneAction({
      accountId: TEAM_ID,
      timezone: 'America/Ciudad_Juarez',
    });

    expect(result).toEqual({
      ok: false,
      refusal:
        "America/Ciudad_Juarez isn't a supported time zone; pick another",
    });
    expect(world.events).toEqual([]);
  });

  it('refuses a zone only the database knows and saves nothing', async () => {
    const result = await updateTeamTimezoneAction({
      accountId: TEAM_ID,
      timezone: 'posix/America/New_York',
    });

    expect(result).toEqual({
      ok: false,
      refusal:
        "posix/America/New_York isn't a supported time zone; pick another",
    });
    expect(world.events).toEqual([]);
  });
});

describe('retrying the schedule move', () => {
  it("moves the team's schedules again", async () => {
    const result = await retryTeamScheduleSyncAction({ accountId: TEAM_ID });

    expect(result).toEqual({ ok: true, value: { schedulesError: null } });
    expect(world.events).toEqual([`sync schedules of ${TEAM_ID}`]);
  });

  it('says schedules still did not move', async () => {
    world.scheduleSyncFails = true;

    const result = await retryTeamScheduleSyncAction({ accountId: TEAM_ID });

    expect(result).toEqual({
      ok: true,
      value: { schedulesError: SCHEDULES_STUCK },
    });
  });

  it('says how many workflows still kept their old schedules', async () => {
    world.someSchedulesFail = true;

    const result = await retryTeamScheduleSyncAction({ accountId: TEAM_ID });

    expect(result).toEqual({
      ok: true,
      value: {
        schedulesError:
          "2 of 5 workflows' schedules couldn't be updated; try again",
      },
    });
  });

  it('refuses members who cannot manage settings', async () => {
    world.canManageSettings = false;

    const result = await retryTeamScheduleSyncAction({ accountId: TEAM_ID });

    expect(result).toEqual({
      ok: false,
      refusal: 'Changing the time zone needs settings.manage',
    });
    expect(world.events).toEqual([]);
  });
});
