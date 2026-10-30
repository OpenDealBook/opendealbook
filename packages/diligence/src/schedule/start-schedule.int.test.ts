import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { appendDealEvent } from '@odb/events';

import {
  provisionAccount,
  type IntegrationAccount,
} from '../../test-support/integration-harness';

const caller = vi.hoisted(() => ({ client: null as unknown, userId: '' }));

vi.mock('@odb/next/actions', () => ({
  enhanceAction:
    (
      fn: (input: unknown, user: unknown) => unknown,
      config: { schema: { parse: (input: unknown) => unknown } },
    ) =>
    async (input: unknown) =>
      fn(config.schema.parse(input), { id: caller.userId }),
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => caller.client,
}));

import { scheduleFromLoiSigned, scheduleFromTemplate } from './actions';

let owner: IntegrationAccount;

async function newDeal(): Promise<string> {
  const dealId = crypto.randomUUID();
  const { data: firm } = await owner.user
    .from('firm')
    .insert({ account_id: owner.accountId, name: 'Schedule deal' })
    .select('id')
    .single()
    .throwOnError();

  await appendDealEvent(owner.user, {
    dealId,
    aggregateType: 'deal',
    aggregateId: dealId,
    eventType: 'deal.created',
    payload: {
      account_id: owner.accountId,
      owner_user_id: owner.userId,
      firm_id: firm.id,
      description: 'Schedule deal',
      source: 'manual',
      stage: 'sourcing',
    },
  });

  return dealId;
}

async function acceptOffer(
  dealId: string,
  days: { diligence_days: number; exclusivity_days: number },
) {
  const offerId = crypto.randomUUID();
  const offerEvent = (eventType: string, payload: Record<string, unknown>) =>
    appendDealEvent(owner.admin, {
      dealId,
      aggregateType: 'offer',
      aggregateId: offerId,
      eventType: eventType as never,
      payload: payload as never,
      actorKind: 'service',
    });

  await offerEvent('offer.drafted', {});
  await offerEvent('offer.version_added', {
    version_id: crypto.randomUUID(),
    number: 1,
    author_side: 'buyer',
    purchase_price: 1_000_000,
    ...days,
    terms: {},
  });
  await offerEvent('offer.accepted', {});
}

async function targetsOf(dealId: string) {
  const { data } = await owner.admin
    .from('deal_milestone')
    .select('kind, target_on')
    .eq('deal_id', dealId)
    .in('kind', ['apa_signing', 'exclusivity_end'])
    .order('kind')
    .throwOnError();

  return data;
}

async function scheduleOf(dealId: string) {
  const { data } = await owner.admin
    .from('diligence_schedule')
    .select('start_date, template_id, weeks:schedule_week(starts_on)')
    .eq('deal_id', dealId)
    .single()
    .throwOnError();

  return data;
}

beforeAll(async () => {
  owner = await provisionAccount();
  caller.client = owner.user;
  caller.userId = owner.userId;
});

afterAll(async () => {
  await owner.admin.from('accounts').delete().eq('id', owner.accountId);
  await owner.cleanup();
});

describe('starting a diligence schedule from the empty Schedule tab', () => {
  it('applies the chosen template to the deal and schedules six weeks from the start date', async () => {
    const dealId = await newDeal();
    const { data: template } = await owner.admin
      .from('checklist_template')
      .insert({ account_id: owner.accountId, name: 'Lean', kind: 'diligence' })
      .select('id')
      .single()
      .throwOnError();
    await owner.admin
      .from('checklist_template_item')
      .insert({ template_id: template.id, title: 'Bank statements' })
      .throwOnError();

    await scheduleFromTemplate({
      dealId,
      templateId: template.id,
      startDate: '2026-11-02',
    });

    const schedule = await scheduleOf(dealId);
    const { data: items } = await owner.admin
      .from('checklist_item')
      .select('title')
      .eq('deal_id', dealId)
      .throwOnError();

    expect(schedule.start_date).toBe('2026-11-02');
    expect(schedule.template_id).toBe(template.id);
    expect(schedule.weeks).toHaveLength(6);
    expect(items.map((item) => item.title)).toEqual(['Bank statements']);
  });

  it('says the template was applied', async () => {
    const dealId = await newDeal();
    const { data: template } = await owner.admin
      .from('checklist_template')
      .insert({ account_id: owner.accountId, name: 'Tiny', kind: 'diligence' })
      .select('id')
      .single()
      .throwOnError();

    expect(
      await scheduleFromTemplate({
        dealId,
        templateId: template.id,
        startDate: '2026-11-02',
      }),
    ).toEqual({ ok: true, value: undefined });
  });

  it('records the LOI signed date, applies the default diligence template and schedules six weeks from it', async () => {
    const dealId = await newDeal();
    await owner.admin
      .from('checklist_template')
      .update({ is_default: false })
      .eq('account_id', owner.accountId)
      .eq('kind', 'diligence')
      .throwOnError();
    const { data: template } = await owner.admin
      .from('checklist_template')
      .insert({
        account_id: owner.accountId,
        name: 'House default',
        kind: 'diligence',
        is_default: true,
      })
      .select('id')
      .single()
      .throwOnError();
    await owner.admin
      .from('checklist_template_item')
      .insert({ template_id: template.id, title: 'Tax returns' })
      .throwOnError();

    const result = await scheduleFromLoiSigned({
      dealId,
      signedOn: '2026-10-05',
    });

    const schedule = await scheduleOf(dealId);
    const { data: milestone } = await owner.admin
      .from('deal_milestone')
      .select('actual_on')
      .eq('deal_id', dealId)
      .eq('kind', 'loi_signed')
      .single()
      .throwOnError();
    const { data: items } = await owner.admin
      .from('checklist_item')
      .select('title')
      .eq('deal_id', dealId)
      .throwOnError();

    expect(result).toEqual({ ok: true, value: undefined });
    expect(schedule.start_date).toBe('2026-10-05');
    expect(schedule.weeks).toHaveLength(6);
    expect(milestone.actual_on).toBe('2026-10-05');
    expect(items.map((item) => item.title)).toEqual(['Tax returns']);
  });

  it('targets APA signing and the end of exclusivity from the accepted offer, counted from the LOI signed date', async () => {
    const dealId = await newDeal();
    await acceptOffer(dealId, { diligence_days: 45, exclusivity_days: 30 });

    await scheduleFromLoiSigned({ dealId, signedOn: '2026-10-05' });

    expect(await targetsOf(dealId)).toEqual([
      { kind: 'exclusivity_end', target_on: '2026-11-04' },
      { kind: 'apa_signing', target_on: '2026-11-19' },
    ]);
  });

  it('records the date and schedules diligence with no targets when the deal has no accepted offer', async () => {
    const dealId = await newDeal();

    const result = await scheduleFromLoiSigned({
      dealId,
      signedOn: '2026-10-05',
    });

    expect(result).toEqual({ ok: true, value: undefined });
    expect((await scheduleOf(dealId)).start_date).toBe('2026-10-05');
    expect(await targetsOf(dealId)).toEqual([]);
  });

  it('applies no default checklist at signing to a deal whose diligence checklist was picked on the Schedule tab', async () => {
    const dealId = await newDeal();
    await owner.admin
      .from('checklist_template')
      .update({ is_default: false })
      .eq('account_id', owner.accountId)
      .eq('kind', 'diligence')
      .throwOnError();
    const { data: templates } = await owner.admin
      .from('checklist_template')
      .insert([
        {
          account_id: owner.accountId,
          name: 'Picked',
          kind: 'diligence',
          is_default: false,
        },
        {
          account_id: owner.accountId,
          name: 'Team default',
          kind: 'diligence',
          is_default: true,
        },
      ])
      .select('id, name')
      .throwOnError();
    const idOf = (name: string) => templates.find((t) => t.name === name)!.id;
    await owner.admin
      .from('checklist_template_item')
      .insert([
        { template_id: idOf('Picked'), title: 'Bank statements' },
        { template_id: idOf('Team default'), title: 'Tax returns' },
      ])
      .throwOnError();
    await scheduleFromTemplate({
      dealId,
      templateId: idOf('Picked'),
      startDate: '2026-09-28',
    });

    await scheduleFromLoiSigned({ dealId, signedOn: '2026-10-05' });

    const { data: items } = await owner.admin
      .from('checklist_item')
      .select('title')
      .eq('deal_id', dealId)
      .throwOnError();
    expect(items.map((item) => item.title)).toEqual(['Bank statements']);
  });

  it('updates an LOI signed milestone the deal already has instead of adding a second', async () => {
    const dealId = await newDeal();
    const milestoneId = crypto.randomUUID();
    await appendDealEvent(owner.user, {
      dealId,
      aggregateType: 'deal_milestone',
      aggregateId: milestoneId,
      eventType: 'deal_milestone.set',
      payload: {
        kind: 'loi_signed',
        target_on: '2026-10-20',
        actual_on: null,
        shared: false,
      },
    });

    await scheduleFromLoiSigned({ dealId, signedOn: '2026-10-05' });

    const { data: milestones } = await owner.admin
      .from('deal_milestone')
      .select('id, target_on, actual_on, shared')
      .eq('deal_id', dealId)
      .eq('kind', 'loi_signed')
      .throwOnError();

    expect(milestones).toEqual([
      {
        id: milestoneId,
        target_on: '2026-10-20',
        actual_on: '2026-10-05',
        shared: false,
      },
    ]);
  });

  it('refuses an LOI signed date in the future and schedules nothing', async () => {
    const dealId = await newDeal();

    expect(
      await scheduleFromLoiSigned({ dealId, signedOn: '2099-01-01' }),
    ).toEqual({
      ok: false,
      refusal: 'An LOI signed date cannot be in the future.',
    });

    const { data: schedules } = await owner.admin
      .from('diligence_schedule')
      .select('id')
      .eq('deal_id', dealId)
      .throwOnError();
    expect(schedules).toEqual([]);
  });

  it('refuses someone from another team', async () => {
    const dealId = await newDeal();
    const outsider = await provisionAccount();
    caller.client = outsider.user;
    caller.userId = outsider.userId;

    const result = await scheduleFromLoiSigned({
      dealId,
      signedOn: '2026-10-05',
    });

    caller.client = owner.user;
    caller.userId = owner.userId;
    await outsider.admin.from('accounts').delete().eq('id', outsider.accountId);
    await outsider.cleanup();

    expect(result).toEqual({
      ok: false,
      refusal: "Only the deal team can change this deal's schedule.",
    });
  });
});
