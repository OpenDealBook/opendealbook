import {
  afterAll,
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

const TODAY = '2025-04-16';
const YESTERDAY = '2025-04-15';

type Person = Awaited<ReturnType<typeof provisionPerson>>;

let teamOwner: Person;
let dealOwner: Person;
let teamId: string;
let teamSlug: string;
let dealId: string;

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

let milestoneId: string;

async function setMilestone(milestone: {
  id?: string;
  kind: string;
  label?: string;
  targetOn: string;
  actualOn: string | null;
}) {
  milestoneId = milestone.id ?? crypto.randomUUID();
  await appendDealEvent({
    aggregateType: 'deal_milestone',
    aggregateId: milestoneId,
    eventType: 'deal_milestone.set',
    payload: {
      kind: milestone.kind,
      label: milestone.label,
      target_on: milestone.targetOn,
      actual_on: milestone.actualOn,
    },
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
  teamId = await provisionTeam(teamOwner, 'Overdue Partners');
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
});

afterAll(async () => {
  await cleanUp([teamId]);
});

describe('overdue milestone notice', () => {
  it('tells the deal owner in the app the day after a target passes with no actual, once', async () => {
    await setMilestone({
      kind: 'closing',
      targetOn: YESTERDAY,
      actualOn: null,
    });

    await notifyOverdueMilestones(TODAY);
    await notifyOverdueMilestones(TODAY);

    expect(await noticesForDeal()).toEqual([
      notice(
        dealOwner.userId,
        'Closing on Seller room deal was due Apr 15, 2025 and has no actual date.',
      ),
    ]);
  });

  it('does not repeat the notice when a run died before recording it as sent', async () => {
    await setMilestone({
      kind: 'closing',
      targetOn: YESTERDAY,
      actualOn: null,
    });
    const realFetch = globalThis.fetch;
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).includes('/deal_milestone_overdue_notice') &&
      init?.method === 'POST'
        ? Promise.reject(new Error('worker died'))
        : realFetch(input, init),
    );
    await expect(notifyOverdueMilestones(TODAY)).rejects.toThrow();
    vi.unstubAllGlobals();

    await notifyOverdueMilestones(TODAY);

    expect(await noticesForDeal()).toEqual([
      notice(
        dealOwner.userId,
        'Closing on Seller room deal was due Apr 15, 2025 and has no actual date.',
      ),
    ]);
  });

  it('names a custom milestone by its label', async () => {
    await setMilestone({
      kind: 'custom',
      label: 'Landlord consent',
      targetOn: YESTERDAY,
      actualOn: null,
    });

    await notifyOverdueMilestones(TODAY);

    expect(await noticesForDeal()).toEqual([
      notice(
        dealOwner.userId,
        'Landlord consent on Seller room deal was due Apr 15, 2025 and has no actual date.',
      ),
    ]);
  });

  it('catches up on a target missed while the job did not run', async () => {
    await setMilestone({
      kind: 'closing',
      targetOn: '2025-04-12',
      actualOn: null,
    });

    await notifyOverdueMilestones(TODAY);

    expect(await noticesForDeal()).toEqual([
      notice(
        dealOwner.userId,
        'Closing on Seller room deal was due Apr 12, 2025 and has no actual date.',
      ),
    ]);
  });

  it('notifies again when a moved target is missed again', async () => {
    const id = crypto.randomUUID();
    await setMilestone({
      id,
      kind: 'closing',
      targetOn: '2025-04-10',
      actualOn: null,
    });
    await notifyOverdueMilestones('2025-04-11');
    await setMilestone({
      id,
      kind: 'closing',
      targetOn: YESTERDAY,
      actualOn: null,
    });

    await notifyOverdueMilestones(TODAY);

    expect(await noticesForDeal()).toEqual([
      notice(
        dealOwner.userId,
        'Closing on Seller room deal was due Apr 10, 2025 and has no actual date.',
      ),
      notice(
        dealOwner.userId,
        'Closing on Seller room deal was due Apr 15, 2025 and has no actual date.',
      ),
    ]);
  });

  it('tells every deal manager when the deal has no owner', async () => {
    dealId = crypto.randomUUID();
    const { data: firm } = await admin
      .from('firm')
      .insert({ account_id: teamId, name: 'Seller room deal' })
      .select('id')
      .single()
      .throwOnError();
    await appendDealEvent({
      aggregateType: 'deal',
      aggregateId: dealId,
      eventType: 'deal.created',
      payload: {
        account_id: teamId,
        firm_id: firm.id,
        description: 'Seller room deal',
      },
    });
    await setMilestone({
      kind: 'closing',
      targetOn: YESTERDAY,
      actualOn: null,
    });
    const managers = await dealManagerIds(admin, teamId);

    await notifyOverdueMilestones(TODAY);

    expect(managers).toContain(teamOwner.userId);
    expect(
      (await noticesForDeal()).map((row) => row.recipient_user_id).sort(),
    ).toEqual([...managers].sort());
  });

  it('tells every deal manager when the deal owner has left the team', async () => {
    const formerMember = await provisionPerson();
    dealId = await newDeal(teamId, formerMember);
    await setMilestone({
      kind: 'closing',
      targetOn: YESTERDAY,
      actualOn: null,
    });
    const managers = await dealManagerIds(admin, teamId);

    await notifyOverdueMilestones(TODAY);

    expect(managers).not.toContain(formerMember.userId);
    expect(
      (await noticesForDeal()).map((row) => row.recipient_user_id).sort(),
    ).toEqual([...managers].sort());
  });

  it('stays quiet when the milestone has an actual', async () => {
    await setMilestone({
      kind: 'closing',
      targetOn: YESTERDAY,
      actualOn: YESTERDAY,
    });

    await notifyOverdueMilestones(TODAY);

    expect(await noticesForDeal()).toEqual([]);
  });

  it('sends the exclusivity lapse notice in the same run, never an overdue one for it', async () => {
    await setMilestone({
      kind: 'closing',
      targetOn: YESTERDAY,
      actualOn: null,
    });
    const closingId = milestoneId;
    await setMilestone({
      kind: 'exclusivity_end',
      targetOn: YESTERDAY,
      actualOn: null,
    });
    const exclusivityId = milestoneId;

    await notifyOverdueMilestones(`${TODAY}T13:00:00.000Z`);

    expect(await noticesForDeal()).toEqual([
      {
        ...notice(
          dealOwner.userId,
          'Closing on Seller room deal was due Apr 15, 2025 and has no actual date.',
        ),
        link: `/home/${teamSlug}/deals/${dealId}#milestone-${closingId}`,
      },
      {
        ...notice(
          dealOwner.userId,
          'Exclusivity on Seller room deal lapsed on Apr 15, 2025.',
        ),
        link: `/home/${teamSlug}/deals/${dealId}#milestone-${exclusivityId}`,
      },
    ]);
  });

  it('stays quiet on the target day itself', async () => {
    await setMilestone({ kind: 'closing', targetOn: TODAY, actualOn: null });

    await notifyOverdueMilestones(TODAY);

    expect(await noticesForDeal()).toEqual([]);
  });

  it('skips a resolved deal', async () => {
    await setMilestone({
      kind: 'closing',
      targetOn: YESTERDAY,
      actualOn: null,
    });
    await appendDealEvent({
      aggregateType: 'deal',
      aggregateId: dealId,
      eventType: 'deal.resolved',
      payload: { resolution: 'lost' },
    });

    await notifyOverdueMilestones(TODAY);

    expect(await noticesForDeal()).toEqual([]);
  });

  it('skips an archived deal', async () => {
    await setMilestone({
      kind: 'closing',
      targetOn: YESTERDAY,
      actualOn: null,
    });
    await appendDealEvent({
      aggregateType: 'deal',
      aggregateId: dealId,
      eventType: 'deal.archived',
      payload: {},
    });

    await notifyOverdueMilestones(TODAY);

    expect(await noticesForDeal()).toEqual([]);
  });

  it('still tells the deal owner when hundreds of other milestones are already overdue', async () => {
    const fillerDealId = await newDeal(teamId, dealOwner);
    const fillerIds = Array.from({ length: 400 }, () => crypto.randomUUID());
    for (let batch = 0; batch < fillerIds.length; batch += 50) {
      await Promise.all(
        fillerIds.slice(batch, batch + 50).map((id) =>
          admin
            .rpc('append_deal_event', {
              p_deal_id: fillerDealId,
              p_aggregate_type: 'deal_milestone',
              p_aggregate_id: id,
              p_event_type: 'deal_milestone.set',
              p_payload: {
                kind: 'custom',
                label: 'Filler consent',
                target_on: '2025-04-01',
                actual_on: null,
              },
              p_actor_kind: 'service',
            })
            .throwOnError(),
        ),
      );
    }
    await admin
      .from('deal_milestone_overdue_notice')
      .insert(
        fillerIds.map((id) => ({ milestone_id: id, target_on: '2025-04-01' })),
      )
      .throwOnError();
    await setMilestone({
      kind: 'closing',
      targetOn: YESTERDAY,
      actualOn: null,
    });

    await notifyOverdueMilestones(TODAY);

    expect(await noticesForDeal()).toEqual([
      notice(
        dealOwner.userId,
        'Closing on Seller room deal was due Apr 15, 2025 and has no actual date.',
      ),
    ]);
  });

  it('still tells the deal owner when more overdue milestones sort ahead of it than one read returns', async () => {
    const fillerDealId = await newDeal(teamId, dealOwner);
    const fillerIds = Array.from({ length: 1000 }, () => crypto.randomUUID());
    for (let batch = 0; batch < fillerIds.length; batch += 50) {
      await Promise.all(
        fillerIds.slice(batch, batch + 50).map((id) =>
          admin
            .rpc('append_deal_event', {
              p_deal_id: fillerDealId,
              p_aggregate_type: 'deal_milestone',
              p_aggregate_id: id,
              p_event_type: 'deal_milestone.set',
              p_payload: {
                kind: 'custom',
                label: 'Filler consent',
                target_on: '2025-04-01',
                actual_on: null,
              },
              p_actor_kind: 'service',
            })
            .throwOnError(),
        ),
      );
    }
    await admin
      .from('deal_milestone_overdue_notice')
      .insert(
        fillerIds.map((id) => ({ milestone_id: id, target_on: '2025-04-01' })),
      )
      .throwOnError();
    await setMilestone({
      id: `ffffffff-ffff-4fff-bfff-${crypto.randomUUID().slice(-12)}`,
      kind: 'closing',
      targetOn: YESTERDAY,
      actualOn: null,
    });

    await notifyOverdueMilestones(TODAY);

    expect(await noticesForDeal()).toEqual([
      notice(
        dealOwner.userId,
        'Closing on Seller room deal was due Apr 15, 2025 and has no actual date.',
      ),
    ]);
  });

  it('skips a locked team', async () => {
    await setMilestone({
      kind: 'closing',
      targetOn: YESTERDAY,
      actualOn: null,
    });

    await withLockedTeam(teamId, async () => {
      await notifyOverdueMilestones(TODAY);
    });

    expect(await noticesForDeal()).toEqual([]);
  });
});
