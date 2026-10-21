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
    await appendDealEvent({
      aggregateType: 'deal',
      aggregateId: dealId,
      eventType: 'deal.created',
      payload: { account_id: teamId, description: 'Seller room deal' },
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
