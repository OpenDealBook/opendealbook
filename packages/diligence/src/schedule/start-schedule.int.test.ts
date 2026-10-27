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

vi.mock(
  '@odb/deals/server',
  () => import('../../../features/deals/src/server/checklist-template'),
);

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
