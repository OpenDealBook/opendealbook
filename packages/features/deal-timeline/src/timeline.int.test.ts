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
  it('lists the eight fixed milestones, unset, before anything is entered', async () => {
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
        kind: 'exclusivity_end',
        label: 'Exclusivity ends',
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

  it('tells whether exclusivity is over, which a resolved deal makes it', async () => {
    expect((await timeline()).exclusivityOver).toBe(false);

    await admin
      .rpc('append_deal_event', {
        p_deal_id: dealId,
        p_aggregate_type: 'deal',
        p_aggregate_id: dealId,
        p_event_type: 'deal.resolved',
        p_payload: { resolution: 'lost' },
        p_actor_kind: 'service',
      })
      .throwOnError();

    expect((await timeline()).exclusivityOver).toBe(true);
  });

  it('tells today by the team time zone', async () => {
    await admin
      .from('accounts')
      .update({ timezone: 'Pacific/Kiritimati' })
      .eq('id', teamId)
      .throwOnError();

    const { teamToday } = await timeline();

    await admin
      .from('accounts')
      .update({ timezone: null })
      .eq('id', teamId)
      .throwOnError();
    expect(teamToday).toBe(
      new Date(Date.now() + 14 * 3_600_000).toISOString().slice(0, 10),
    );
  });

  it('flags an extension agreed after the end it extended, and only that one', async () => {
    async function extension(agreedOn: string, endBefore: string | null) {
      const id = crypto.randomUUID();
      await admin
        .rpc('append_deal_event', {
          p_deal_id: dealId,
          p_aggregate_type: 'deal_milestone',
          p_aggregate_id: id,
          p_event_type: 'deal_milestone.set',
          p_payload: {
            kind: 'custom',
            label: 'LOI extension to Dec 15, 2026',
            target_on: null,
            actual_on: agreedOn,
            shared: true,
            extension_id: crypto.randomUUID(),
            exclusivity_end_before: endBefore,
          },
          p_actor_kind: 'service',
        })
        .throwOnError();

      return id;
    }
    const late = await extension('2025-11-02', '2025-11-01');
    await admin
      .rpc('append_deal_event', {
        p_deal_id: dealId,
        p_aggregate_type: 'deal_milestone',
        p_aggregate_id: late,
        p_event_type: 'deal_milestone.set',
        p_payload: {
          kind: 'custom',
          label: 'LOI extension to Dec 15, 2026',
          target_on: null,
          actual_on: '2025-11-02',
          shared: true,
          exclusivity_end_before: '2025-11-05',
        },
        p_actor_kind: 'service',
      })
      .throwOnError();
    const onTime = await extension('2025-11-01', '2025-11-01');
    const noEnd = await extension('2025-11-02', null);
    await setMilestone({
      dealId,
      milestoneId: crypto.randomUUID(),
      kind: 'custom',
      label: 'Landlord consent',
      targetOn: '2025-10-01',
      actualOn: '2025-11-02',
      shared: false,
    });

    const { lapsedExtensions } = await timeline();

    expect(lapsedExtensions).toEqual([late]);
    expect(lapsedExtensions).not.toContain(onTime);
    expect(lapsedExtensions).not.toContain(noEnd);
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
    expect(milestones).toHaveLength(9);
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

describe('setting the LOI signed date on the timeline', () => {
  let loiSignedId: string;

  function loiSigned(actualOn: string | null) {
    return setMilestone({
      dealId,
      milestoneId: loiSignedId,
      kind: 'loi_signed',
      targetOn: null,
      actualOn,
      shared: true,
    });
  }

  async function acceptOffer() {
    const offerId = crypto.randomUUID();
    for (const [eventType, payload] of [
      ['offer.drafted', {}],
      [
        'offer.version_added',
        {
          version_id: crypto.randomUUID(),
          number: 1,
          author_side: 'buyer',
          purchase_price: 1_000_000,
          diligence_days: 45,
          exclusivity_days: 30,
          terms: {},
        },
      ],
      ['offer.accepted', {}],
    ] as const) {
      await admin
        .rpc('append_deal_event', {
          p_deal_id: dealId,
          p_aggregate_type: 'offer',
          p_aggregate_id: offerId,
          p_event_type: eventType,
          p_payload: payload,
          p_actor_kind: 'service',
        })
        .throwOnError();
    }
  }

  async function defaultDiligenceTemplate(itemTitle: string) {
    await admin
      .from('checklist_template')
      .update({ is_default: false })
      .eq('account_id', teamId)
      .eq('kind', 'diligence')
      .throwOnError();
    const { data: template } = await admin
      .from('checklist_template')
      .insert({
        account_id: teamId,
        name: 'Timeline diligence',
        kind: 'diligence',
        is_default: true,
      })
      .select('id')
      .single()
      .throwOnError();
    await admin
      .from('checklist_template_item')
      .insert({
        template_id: template.id,
        title: itemTitle,
        due_offset_days: 7,
      })
      .throwOnError();
  }

  async function setUpOf() {
    const [
      { data: schedules },
      { data: items },
      { data: targets },
      { data: actors },
    ] = await Promise.all([
      admin
        .from('diligence_schedule')
        .select('start_date, created_by')
        .eq('deal_id', dealId)
        .throwOnError(),
      admin
        .from('checklist_item')
        .select('title')
        .eq('deal_id', dealId)
        .throwOnError(),
      admin
        .from('deal_milestone')
        .select('kind, target_on')
        .eq('deal_id', dealId)
        .in('kind', ['apa_signing', 'exclusivity_end'])
        .order('kind')
        .throwOnError(),
      admin
        .from('deal_event')
        .select('actor_kind, actor_ref')
        .eq('deal_id', dealId)
        .in('aggregate_type', ['checklist_item', 'deal_milestone'])
        .throwOnError(),
    ]);

    return {
      schedules,
      items,
      targets,
      actors: new Set(actors.map((a) => `${a.actor_kind}:${a.actor_ref}`)),
    };
  }

  const firstSetUp = () => ({
    schedules: [{ start_date: '2026-10-05', created_by: owner.userId }],
    items: [{ title: 'Tax returns' }],
    targets: [
      { kind: 'exclusivity_end', target_on: '2026-11-04' },
      { kind: 'apa_signing', target_on: '2026-11-19' },
    ],
    actors: new Set([`user:${owner.userId}`]),
  });

  beforeEach(async () => {
    loiSignedId = crypto.randomUUID();
    await defaultDiligenceTemplate('Tax returns');
    await acceptOffer();
  });

  it('schedules diligence, applies the default checklist and targets APA signing and exclusivity end, as the person who set it', async () => {
    expect(await loiSigned('2026-10-05')).toEqual({
      ok: true,
      value: undefined,
    });

    expect(await setUpOf()).toEqual(firstSetUp());
  });

  it('completes the setup on the next save after an earlier setup stopped short', async () => {
    await loiSigned('2026-10-05');
    const { data: targets } = await admin
      .from('deal_milestone')
      .select('id')
      .eq('deal_id', dealId)
      .in('kind', ['apa_signing', 'exclusivity_end'])
      .throwOnError();
    for (const { id } of targets) {
      await removeMilestone({ dealId, milestoneId: id });
    }

    expect(await loiSigned('2026-10-05')).toEqual({ ok: true, value: undefined });

    expect(await setUpOf()).toEqual(firstSetUp());
  });

  it('keeps the setup when the date is changed, even after the team switches its default checklist', async () => {
    await loiSigned('2026-10-05');
    await defaultDiligenceTemplate('Leases');

    expect(await loiSigned('2026-10-06')).toEqual({
      ok: true,
      value: undefined,
    });

    expect(await setUpOf()).toEqual(firstSetUp());
  });

  it('keeps the setup when the date is cleared and filled in again, even after the team switches its default checklist', async () => {
    await loiSigned('2026-10-05');
    await loiSigned(null);
    await defaultDiligenceTemplate('Leases');

    expect(await loiSigned('2026-10-07')).toEqual({
      ok: true,
      value: undefined,
    });

    expect(await setUpOf()).toEqual(firstSetUp());
  });
});
