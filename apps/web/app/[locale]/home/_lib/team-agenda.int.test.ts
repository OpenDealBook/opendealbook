import type { SupabaseClient } from '@supabase/supabase-js';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  admin,
  cleanUp,
  newDeal,
  provisionPerson,
  provisionTeam,
  type Person,
} from '@odb/seller-rooms/test-support/world.ts';

const world = vi.hoisted(() => ({
  client: null as unknown as SupabaseClient,
}));

vi.mock('@odb/supabase/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@odb/supabase/server')>()),
  getSupabaseServerClient: () => world.client,
}));

import { loadTeamAgenda } from './team-agenda';

let owner: Person;
let teamId: string;

function daysFromNow(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

async function exclusivityEnd(targetOn: string) {
  const dealId = await newDeal(teamId, owner);
  const milestoneId = crypto.randomUUID();
  await admin
    .rpc('append_deal_event', {
      p_deal_id: dealId,
      p_aggregate_type: 'deal_milestone',
      p_aggregate_id: milestoneId,
      p_event_type: 'deal_milestone.set',
      p_payload: {
        kind: 'exclusivity_end',
        target_on: targetOn,
        actual_on: null,
      },
      p_actor_kind: 'service',
    })
    .throwOnError();

  return milestoneId;
}

beforeAll(async () => {
  owner = await provisionPerson();
  teamId = await provisionTeam(owner, 'Harbor Holdings');
  world.client = owner.client;
});

afterAll(async () => {
  await cleanUp([teamId]);
});

describe('loadTeamAgenda', () => {
  it('carries the database verdict on whether an exclusivity end has lapsed', async () => {
    const lapsed = await exclusivityEnd(daysFromNow(-3));
    const ahead = await exclusivityEnd(daysFromNow(5));

    const rows = await loadTeamAgenda(teamId, false);
    const lapsedById = Object.fromEntries(
      rows.map((row) => [row.item_id, row.lapsed]),
    );

    expect(lapsedById[lapsed]).toBe(true);
    expect(lapsedById[ahead]).toBe(false);
  });
});
