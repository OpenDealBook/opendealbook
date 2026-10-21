import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

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

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL);
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', ANON_KEY);
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', SERVICE_ROLE_KEY);

const world = vi.hoisted(() => ({ signedInClient: null as unknown }));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => world.signedInClient,
}));

const { removeMilestone, setMilestone } = await import('./actions');
const { loadDealTimeline } = await import('./queries');

type Person = Awaited<ReturnType<typeof provisionPerson>>;

let owner: Person;
let member: Person;
let viewer: Person;
let ownerName: string;
let teamId: string;
let dealId: string;

function utcDayFromToday(days: number) {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

function timeline() {
  return loadDealTimeline(owner.client, dealId);
}

beforeAll(async () => {
  owner = await provisionPerson();
  teamId = await provisionTeam(owner, 'Timeline Partners');
  member = await provisionPerson();
  viewer = await provisionPerson();
  await admin
    .from('accounts_memberships')
    .insert([
      { account_id: teamId, user_id: member.userId, account_role: 'member' },
      { account_id: teamId, user_id: viewer.userId, account_role: 'viewer' },
    ])
    .throwOnError();
  const { data: personal } = await admin
    .from('accounts')
    .select('name')
    .eq('primary_owner_user_id', owner.userId)
    .eq('is_personal_account', true)
    .single()
    .throwOnError();
  ownerName = personal.name;
});

beforeEach(async () => {
  world.signedInClient = owner.client;
  dealId = await newDeal(teamId, owner);
});

function closingTarget(targetOn: string) {
  return setMilestone({
    dealId,
    milestoneId: crypto.randomUUID(),
    kind: 'closing',
    targetOn,
    actualOn: null,
    shared: true,
  });
}

afterAll(async () => {
  await cleanUp([teamId]);
});

describe('deal timeline', () => {
  it('lists the seven fixed milestones, unset, before anything is entered', async () => {
    const { milestones, history } = await timeline();

    expect(milestones).toEqual([
      {
        id: null,
        kind: 'loi_deadline',
        label: 'LOI deadline',
        targetOn: null,
        actualOn: null,
        shared: false,
      },
      {
        id: null,
        kind: 'loi_signed',
        label: 'LOI signed',
        targetOn: null,
        actualOn: null,
        shared: true,
      },
      {
        id: null,
        kind: 'diligence_end',
        label: 'Diligence end',
        targetOn: null,
        actualOn: null,
        shared: false,
      },
      {
        id: null,
        kind: 'financing_contingency',
        label: 'Financing contingency',
        targetOn: null,
        actualOn: null,
        shared: false,
      },
      {
        id: null,
        kind: 'apa_signing',
        label: 'APA signing',
        targetOn: null,
        actualOn: null,
        shared: true,
      },
      {
        id: null,
        kind: 'closing',
        label: 'Closing',
        targetOn: null,
        actualOn: null,
        shared: true,
      },
      {
        id: null,
        kind: 'effective',
        label: 'Effective date',
        targetOn: null,
        actualOn: null,
        shared: true,
      },
    ]);
    expect(history).toEqual([]);
  });

  it('tells a manager and a team member they can edit and a read-only teammate they cannot', async () => {
    expect((await loadDealTimeline(owner.client, dealId)).canManage).toBe(true);
    expect((await loadDealTimeline(member.client, dealId)).canManage).toBe(
      true,
    );
    expect((await loadDealTimeline(viewer.client, dealId)).canManage).toBe(
      false,
    );
  });

  it('lets a team member change the timeline', async () => {
    const consentId = crypto.randomUUID();
    world.signedInClient = member.client;

    expect(
      await setMilestone({
        dealId,
        milestoneId: consentId,
        kind: 'custom',
        label: 'Landlord consent',
        targetOn: null,
        actualOn: null,
        shared: false,
      }),
    ).toEqual({ ok: true, value: undefined });
    expect(await removeMilestone({ dealId, milestoneId: consentId })).toEqual({
      ok: true,
      value: undefined,
    });
  });

  it('refuses a read-only teammate', async () => {
    const consentId = crypto.randomUUID();
    await setMilestone({
      dealId,
      milestoneId: consentId,
      kind: 'custom',
      label: 'Landlord consent',
      targetOn: null,
      actualOn: null,
      shared: false,
    });
    world.signedInClient = viewer.client;

    expect(await closingTarget('2026-12-02')).toEqual({
      ok: false,
      refusal: 'You cannot change the timeline on this deal.',
    });
    expect(await removeMilestone({ dealId, milestoneId: consentId })).toEqual({
      ok: false,
      refusal: 'You cannot change the timeline on this deal.',
    });
  });

  it('refuses a locked team', async () => {
    await withLockedTeam(teamId, async () => {
      expect(await closingTarget('2026-12-01')).toEqual({
        ok: false,
        refusal: 'This team is read-only until billing is updated.',
      });
    });
  });

  it('names who made each change, even to a member who cannot read their account', async () => {
    await closingTarget('2026-12-01');

    const { history } = await loadDealTimeline(member.client, dealId);

    expect(history.map((change) => change.by)).toEqual([ownerName]);
  });

  it('shows a change with no actor as made by the system', async () => {
    await admin
      .rpc('append_deal_event', {
        p_deal_id: dealId,
        p_aggregate_type: 'deal_milestone',
        p_aggregate_id: crypto.randomUUID(),
        p_event_type: 'deal_milestone.set',
        p_payload: {
          kind: 'closing',
          target_on: '2026-12-01',
          actual_on: null,
          shared: false,
        },
        p_actor_kind: 'system',
        p_actor_via: 'migration',
      })
      .throwOnError();

    const { history } = await timeline();

    expect(history.map((change) => change.by)).toEqual(['System']);
  });

  it('shows a Documenso change as made by the system via Documenso', async () => {
    await admin
      .rpc('append_deal_event', {
        p_deal_id: dealId,
        p_aggregate_type: 'deal_milestone',
        p_aggregate_id: crypto.randomUUID(),
        p_event_type: 'deal_milestone.set',
        p_payload: {
          kind: 'apa_signing',
          target_on: null,
          actual_on: '2026-10-01',
          shared: true,
        },
        p_actor_kind: 'service',
        p_actor_via: 'documenso',
      })
      .throwOnError();

    const { history } = await timeline();

    expect(history.map((change) => change.by)).toEqual([
      'System via Documenso',
    ]);
  });

  it('keeps a live milestone and names a since-deleted account a former member', async () => {
    const leaver = await provisionPerson();
    await admin
      .from('accounts_memberships')
      .insert({
        account_id: teamId,
        user_id: leaver.userId,
        account_role: 'owner',
      })
      .throwOnError();
    const milestoneId = crypto.randomUUID();
    world.signedInClient = leaver.client;
    await setMilestone({
      dealId,
      milestoneId,
      kind: 'closing',
      targetOn: '2026-12-01',
      actualOn: null,
      shared: true,
    });
    world.signedInClient = owner.client;
    const { error } = await admin.auth.admin.deleteUser(leaver.userId);
    expect(error).toBeNull();

    const { milestones, history } = await timeline();

    expect(history.map((change) => change.by)).toEqual(['Former member']);
    expect(
      milestones.find((milestone) => milestone.kind === 'closing'),
    ).toEqual({
      id: milestoneId,
      kind: 'closing',
      label: 'Closing',
      targetOn: '2026-12-01',
      actualOn: null,
      shared: true,
    });
  });

  it('refuses a second create of a fixed milestone someone just set', async () => {
    await closingTarget('2026-12-01');

    expect(await closingTarget('2026-12-05')).toEqual({
      ok: false,
      refusal: 'Someone just set this milestone. Refresh and try again.',
    });
  });

  it('sets a target, actual and sharing on a fixed milestone', async () => {
    const closingId = crypto.randomUUID();

    const result = await setMilestone({
      dealId,
      milestoneId: closingId,
      kind: 'closing',
      targetOn: '2026-12-15',
      actualOn: '2026-10-01',
      shared: false,
    });

    expect(result).toEqual({ ok: true, value: undefined });
    const { milestones } = await timeline();
    expect(
      milestones.find((milestone) => milestone.kind === 'closing'),
    ).toEqual({
      id: closingId,
      kind: 'closing',
      label: 'Closing',
      targetOn: '2026-12-15',
      actualOn: '2026-10-01',
      shared: false,
    });
  });

  it('adds custom milestones after the fixed ones', async () => {
    const consentId = crypto.randomUUID();

    await setMilestone({
      dealId,
      milestoneId: consentId,
      kind: 'custom',
      label: 'Landlord consent',
      targetOn: '2026-11-10',
      actualOn: null,
      shared: true,
    });

    const { milestones } = await timeline();
    expect(milestones.at(-1)).toEqual({
      id: consentId,
      kind: 'custom',
      label: 'Landlord consent',
      targetOn: '2026-11-10',
      actualOn: null,
      shared: true,
    });
    expect(milestones).toHaveLength(8);
  });

  it('refuses a custom milestone without a label', async () => {
    const result = await setMilestone({
      dealId,
      milestoneId: crypto.randomUUID(),
      kind: 'custom',
      label: '   ',
      targetOn: null,
      actualOn: null,
      shared: false,
    });

    expect(result).toEqual({ ok: false, refusal: 'Name the milestone first.' });
  });

  it('accepts an actual of UTC tomorrow and refuses one past it', async () => {
    const milestoneId = crypto.randomUUID();
    const set = (actualOn: string) =>
      setMilestone({
        dealId,
        milestoneId,
        kind: 'diligence_end',
        targetOn: null,
        actualOn,
        shared: false,
      });

    expect(await set(utcDayFromToday(1))).toEqual({
      ok: true,
      value: undefined,
    });
    expect(await set(utcDayFromToday(2))).toEqual({
      ok: false,
      refusal: 'An actual date cannot be in the future.',
    });
  });

  it('removes a fixed milestone back to unset and keeps every change in history', async () => {
    const loiId = crypto.randomUUID();
    const setLoi = (targetOn: string) =>
      setMilestone({
        dealId,
        milestoneId: loiId,
        kind: 'loi_deadline',
        targetOn,
        actualOn: null,
        shared: false,
      });

    await setLoi('2026-10-20');
    await setLoi('2026-10-27');
    expect(await removeMilestone({ dealId, milestoneId: loiId })).toEqual({
      ok: true,
      value: undefined,
    });

    const { milestones, history } = await timeline();
    expect(milestones[0]).toEqual({
      id: null,
      kind: 'loi_deadline',
      label: 'LOI deadline',
      targetOn: null,
      actualOn: null,
      shared: false,
    });
    expect(history.map(({ id: _id, at: _at, ...change }) => change)).toEqual([
      { change: 'removed', milestone: 'LOI deadline', by: ownerName },
      {
        change: 'set',
        by: ownerName,
        milestone: 'LOI deadline',
        targetOn: '2026-10-27',
        actualOn: null,
        shared: false,
      },
      {
        change: 'set',
        by: ownerName,
        milestone: 'LOI deadline',
        targetOn: '2026-10-20',
        actualOn: null,
        shared: false,
      },
    ]);

    const { data: events } = await admin
      .from('deal_event')
      .select('id, created_at')
      .eq('deal_id', dealId)
      .eq('aggregate_type', 'deal_milestone')
      .order('deal_seq', { ascending: false })
      .throwOnError();
    expect(history.map(({ id, at }) => ({ id, at }))).toEqual(
      events.map((event) => ({ id: event.id, at: event.created_at })),
    );
  });
});
