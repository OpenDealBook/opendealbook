import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { dealManagerIds } from '@odb/lender-rooms/actions/deal-manager-ids.ts';
import {
  admin,
  ANON_KEY,
  cleanUp,
  newDeal,
  provisionPerson,
  provisionTeam,
  SERVICE_ROLE_KEY,
  SUPABASE_URL,
  withLockedTeam,
} from '@odb/seller-rooms/test-support/world.ts';
import type { Json } from '@odb/supabase';

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL);
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', ANON_KEY);
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', SERVICE_ROLE_KEY);

const { notifyOverdueMilestones } = await import('./overdue');

const NOW = '2025-04-16T13:00:00Z';
const YESTERDAY = '2025-04-15';
const IN_A_WEEK = '2025-04-23';

type Person = Awaited<ReturnType<typeof provisionPerson>>;

let teamOwner: Person;
let dealOwner: Person;
let teamId: string;
let teamSlug: string;
let dealId: string;
let milestoneId: string;

async function appendDealEvent(event: {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Json;
}) {
  await admin
    .rpc('append_deal_event', {
      p_deal_id: dealId,
      p_aggregate_type: event.aggregateType,
      p_aggregate_id: event.aggregateId,
      p_event_type: event.eventType,
      p_payload: event.payload,
      p_actor_kind: 'service',
    })
    .throwOnError();
}

async function exclusivityEnds(
  targetOn: string,
  actualOn: string | null = null,
) {
  await appendDealEvent({
    aggregateType: 'deal_milestone',
    aggregateId: milestoneId,
    eventType: 'deal_milestone.set',
    payload: {
      kind: 'exclusivity_end',
      target_on: targetOn,
      actual_on: actualOn,
    },
  });
}

async function resolveDeal() {
  await appendDealEvent({
    aggregateType: 'deal',
    aggregateId: dealId,
    eventType: 'deal.resolved',
    payload: { resolution: 'lost' },
  });
}

async function noticesForDeal() {
  const { data } = await admin
    .from('notifications')
    .select('account_id, recipient_user_id, channel, body, link')
    .eq('deal_id', dealId)
    .order('id')
    .throwOnError();

  return data;
}

function notice(recipientUserId: string, body: string) {
  return {
    account_id: teamId,
    recipient_user_id: recipientUserId,
    channel: 'in_app',
    body,
    link: `/home/${teamSlug}/deals/${dealId}#milestone-${milestoneId}`,
  };
}

beforeAll(async () => {
  teamOwner = await provisionPerson();
  teamId = await provisionTeam(teamOwner, 'Exclusivity Partners');
  dealOwner = await provisionPerson();
  await admin
    .from('accounts_memberships')
    .insert({
      account_id: teamId,
      user_id: dealOwner.userId,
      account_role: 'member',
    })
    .throwOnError();
  const { data: team } = await admin
    .from('accounts')
    .select('slug')
    .eq('id', teamId)
    .single()
    .throwOnError();
  teamSlug = team.slug!;
});

beforeEach(async () => {
  dealId = await newDeal(teamId, dealOwner);
  milestoneId = crypto.randomUUID();
});

afterAll(async () => {
  await cleanUp([teamId]);
});

describe('exclusivity lapse notice', () => {
  it('tells the deal owner once that exclusivity lapsed', async () => {
    await exclusivityEnds(YESTERDAY);

    await notifyOverdueMilestones(NOW);
    await notifyOverdueMilestones(NOW);

    expect(await noticesForDeal()).toEqual([
      notice(
        dealOwner.userId,
        'Exclusivity on Seller room deal lapsed on Apr 15, 2025.',
      ),
    ]);
  });

  it('notifies again when a moved end lapses again', async () => {
    await exclusivityEnds('2025-04-10');
    await notifyOverdueMilestones('2025-04-11T13:00:00Z');
    await exclusivityEnds(YESTERDAY);

    await notifyOverdueMilestones(NOW);

    expect(await noticesForDeal()).toEqual([
      notice(
        dealOwner.userId,
        'Exclusivity on Seller room deal lapsed on Apr 10, 2025.',
      ),
      notice(
        dealOwner.userId,
        'Exclusivity on Seller room deal lapsed on Apr 15, 2025.',
      ),
    ]);
  });

  it('stays quiet about an end that lapsed more than a week ago', async () => {
    await exclusivityEnds('2025-03-17');

    await notifyOverdueMilestones(NOW);

    expect(await noticesForDeal()).toEqual([]);
  });

  it('still tells about an end that lapsed a week ago', async () => {
    await exclusivityEnds('2025-04-09');

    await notifyOverdueMilestones(NOW);

    expect(await noticesForDeal()).toEqual([
      notice(
        dealOwner.userId,
        'Exclusivity on Seller room deal lapsed on Apr 9, 2025.',
      ),
    ]);
  });

  it('stays quiet once exclusivity is over', async () => {
    await exclusivityEnds(YESTERDAY);
    await resolveDeal();

    await notifyOverdueMilestones(NOW);

    expect(await noticesForDeal()).toEqual([]);
  });

  it('stays quiet when the end has an actual date', async () => {
    await exclusivityEnds(YESTERDAY, YESTERDAY);

    await notifyOverdueMilestones(NOW);

    expect(await noticesForDeal()).toEqual([]);
  });

  it('tells every deal manager when the deal owner has left the team', async () => {
    dealId = await newDeal(teamId, await provisionPerson());
    await exclusivityEnds(YESTERDAY);
    const managers = await dealManagerIds(admin, teamId);

    await notifyOverdueMilestones(NOW);

    expect(
      (await noticesForDeal()).map((row) => row.recipient_user_id).sort(),
    ).toEqual([...managers].sort());
  });

  it('still tells the deal owner when hundreds of other ends fall near today', async () => {
    for (let batch = 0; batch < 8; batch++) {
      await Promise.all(
        Array.from({ length: 50 }, async () => {
          const otherDealId = await newDeal(teamId, dealOwner);
          await admin
            .rpc('append_deal_event', {
              p_deal_id: otherDealId,
              p_aggregate_type: 'deal_milestone',
              p_aggregate_id: crypto.randomUUID(),
              p_event_type: 'deal_milestone.set',
              p_payload: {
                kind: 'exclusivity_end',
                target_on: '2025-04-08',
                actual_on: null,
              },
              p_actor_kind: 'service',
            })
            .throwOnError();
        }),
      );
    }
    await exclusivityEnds(YESTERDAY);

    await notifyOverdueMilestones(NOW);

    expect(await noticesForDeal()).toEqual([
      notice(
        dealOwner.userId,
        'Exclusivity on Seller room deal lapsed on Apr 15, 2025.',
      ),
    ]);
  });

  it('skips a locked team', async () => {
    await exclusivityEnds(YESTERDAY);

    await withLockedTeam(teamId, async () => {
      await notifyOverdueMilestones(NOW);
    });

    expect(await noticesForDeal()).toEqual([]);
  });
});

describe('the team time zone', () => {
  afterEach(async () => {
    await admin
      .from('accounts')
      .update({ timezone: null })
      .eq('id', teamId)
      .throwOnError();
  });

  it('does not call exclusivity lapsed while the end date is still today for the team', async () => {
    await admin
      .from('accounts')
      .update({ timezone: 'America/Los_Angeles' })
      .eq('id', teamId)
      .throwOnError();
    await exclusivityEnds('2026-11-01');

    await notifyOverdueMilestones('2026-11-02T03:00:00Z');

    expect(await noticesForDeal()).toEqual([
      notice(
        dealOwner.userId,
        'Exclusivity on Seller room deal ends Nov 1, 2026.',
      ),
    ]);
  });

  it('counts the week before the end by the team date', async () => {
    await admin
      .from('accounts')
      .update({ timezone: 'America/Los_Angeles' })
      .eq('id', teamId)
      .throwOnError();
    await exclusivityEnds('2026-11-09');

    await notifyOverdueMilestones('2026-11-02T03:00:00Z');

    expect(await noticesForDeal()).toEqual([]);
  });
});

describe('exclusivity ending soon notice', () => {
  it('tells the deal owner once, a week before exclusivity ends', async () => {
    await exclusivityEnds(IN_A_WEEK);

    await notifyOverdueMilestones(NOW);
    await notifyOverdueMilestones(NOW);

    expect(await noticesForDeal()).toEqual([
      notice(
        dealOwner.userId,
        'Exclusivity on Seller room deal ends Apr 23, 2025.',
      ),
    ]);
  });

  it('catches up on an end that is already less than a week away', async () => {
    await exclusivityEnds('2025-04-19');

    await notifyOverdueMilestones(NOW);

    expect(await noticesForDeal()).toEqual([
      notice(
        dealOwner.userId,
        'Exclusivity on Seller room deal ends Apr 19, 2025.',
      ),
    ]);
  });

  it('stays quiet more than a week out', async () => {
    await exclusivityEnds('2025-04-24');

    await notifyOverdueMilestones(NOW);

    expect(await noticesForDeal()).toEqual([]);
  });

  it('stays quiet once exclusivity is over', async () => {
    await exclusivityEnds(IN_A_WEEK);
    await resolveDeal();

    await notifyOverdueMilestones(NOW);

    expect(await noticesForDeal()).toEqual([]);
  });
});
