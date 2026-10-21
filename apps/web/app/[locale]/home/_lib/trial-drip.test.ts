import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { stubBootEnv } from '../../../../test-env';

type Row = Record<string, unknown>;

const world = vi.hoisted(() => ({
  accounts: {} as Record<string, Row>,
  updates: [] as { id: unknown; row: Row }[],
  started: [] as unknown[],
  startFails: false,
}));

vi.mock('@odb/workflows/client', () => ({
  startTrialDrip: async (input: unknown) => {
    if (world.startFails) {
      throw new Error('Temporal down');
    }
    world.started.push(input);
  },
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerAdminClient: () => ({
    from: () => {
      let update: Row | null = null;
      let id: unknown;
      const builder: Row = {
        select: () => builder,
        update: (row: Row) => {
          update = row;
          return builder;
        },
        eq: (_column: string, value: unknown) => {
          id = value;
          return builder;
        },
        single: () => builder,
        throwOnError: async () => {
          if (update) {
            world.updates.push({ id, row: update });
            return { data: null };
          }
          return { data: world.accounts[id as string] };
        },
      };
      return builder;
    },
  }),
}));

const team = { id: 'team-1', slug: 'acme' };
const owner = { id: 'owner-1', email: 'pat@example.com' };
const inTrial = new Date(Date.now() + 86_400_000).toISOString();

async function load() {
  return import('./trial-drip');
}

beforeEach(() => {
  stubBootEnv({});
  world.accounts = {
    'team-1': {
      slug: 'acme',
      primary_owner_user_id: 'owner-1',
      trial_ends_at: inTrial,
      trial_drip_started_at: null,
    },
    'owner-1': { id: 'owner-1', email: 'pat@example.com' },
  };
  world.updates.length = 0;
  world.started.length = 0;
  world.startFails = false;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('startTeamTrialDrip', () => {
  it('marks the team once the drip has started', async () => {
    const { startTeamTrialDrip } = await load();

    await startTeamTrialDrip(team, owner);

    expect(world.started).toHaveLength(1);
    expect(world.updates).toEqual([
      { id: 'team-1', row: { trial_drip_started_at: expect.any(String) } },
    ]);
  });

  it('leaves the team unmarked when the drip cannot start', async () => {
    world.startFails = true;
    const { startTeamTrialDrip } = await load();

    await expect(startTeamTrialDrip(team, owner)).rejects.toThrow('Temporal down');
    expect(world.updates).toEqual([]);
  });
});

describe('resumeTrialDrip', () => {
  it("starts the drip for the team owner when it never started", async () => {
    const { resumeTrialDrip } = await load();

    await resumeTrialDrip('team-1');

    expect(world.started).toEqual([
      expect.objectContaining({
        accountId: 'team-1',
        userId: 'owner-1',
        email: 'pat@example.com',
      }),
    ]);
  });

  it('does nothing once the drip has started', async () => {
    world.accounts['team-1']!.trial_drip_started_at = '2026-10-01T00:00:00Z';
    const { resumeTrialDrip } = await load();

    await resumeTrialDrip('team-1');

    expect(world.started).toEqual([]);
  });

  it('does nothing after the trial has ended', async () => {
    world.accounts['team-1']!.trial_ends_at = '2026-01-01T00:00:00Z';
    const { resumeTrialDrip } = await load();

    await resumeTrialDrip('team-1');

    expect(world.started).toEqual([]);
  });

  it('does nothing when billing is off', async () => {
    stubBootEnv({ ENABLE_BILLING: 'false' });
    const { resumeTrialDrip } = await load();

    await resumeTrialDrip('team-1');

    expect(world.started).toEqual([]);
  });
});
