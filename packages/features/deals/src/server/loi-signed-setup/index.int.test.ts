import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { appendDealEvent as appendEvent } from '@odb/events';

import {
  type IntegrationAccount,
  provisionAccount,
} from '../../../test-support/integration-harness';
import { setUpDiligenceOnLoiSigned } from '.';

const SIGNED_ON = '2026-10-05';
const VIA = 'documenso';

function appendDealEvent(
  client: IntegrationAccount['admin'],
  event: {
    dealId: string;
    aggregateType: string;
    aggregateId: string;
    eventType: string;
    payload: Record<string, unknown>;
  },
) {
  return appendEvent(client, {
    ...event,
    aggregateType: event.aggregateType as never,
    eventType: event.eventType as never,
    payload: event.payload as never,
    actorKind: 'service',
  });
}

async function seedDeal(
  client: IntegrationAccount['admin'],
  accountId: string,
  ownerUserId: string,
  payload: Record<string, unknown>,
) {
  const dealId = crypto.randomUUID();
  await appendDealEvent(client, {
    dealId,
    aggregateType: 'deal',
    aggregateId: dealId,
    eventType: 'deal.created',
    payload: { account_id: accountId, owner_user_id: ownerUserId, ...payload },
  });

  return dealId;
}

let account: IntegrationAccount;

beforeEach(async () => {
  account = await provisionAccount();
});

afterEach(async () => {
  await account.cleanup();
});

async function dealWithAcceptedOffer(diligenceDays: number | null) {
  const dealId = await seedDeal(
    account.admin,
    account.accountId,
    account.userId,
    { description: 'LOI signed deal' },
  );
  const offerId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const offerEvent = (eventType: string, payload: Record<string, unknown>) =>
    appendDealEvent(account.admin, {
      dealId,
      aggregateType: 'offer',
      aggregateId: offerId,
      eventType,
      payload,
    });

  await offerEvent('offer.drafted', {});
  await offerEvent('offer.version_added', {
    version_id: versionId,
    number: 1,
    author_side: 'buyer',
    purchase_price: 1_000_000,
    diligence_days: diligenceDays,
    terms: {},
  });
  await offerEvent('offer.accepted', {});

  return dealId;
}

async function clearStarterDiligenceDefault() {
  await account.admin
    .from('checklist_template')
    .update({ is_default: false })
    .eq('account_id', account.accountId)
    .eq('kind', 'diligence')
    .throwOnError();
}

async function defaultDiligenceTemplate() {
  await clearStarterDiligenceDefault();
  const { data: template } = await account.admin
    .from('checklist_template')
    .insert({
      account_id: account.accountId,
      name: 'Team diligence',
      kind: 'diligence',
      is_default: true,
    })
    .select('id')
    .single()
    .throwOnError();

  await account.admin
    .from('checklist_template_item')
    .insert([
      { template_id: template.id, title: 'Tax returns', due_offset_days: 7 },
      { template_id: template.id, title: 'Leases', due_offset_days: 14 },
    ])
    .throwOnError();
}

async function checklistOf(dealId: string) {
  const { data } = await account.admin
    .from('checklist_item')
    .select('title, due_at')
    .eq('deal_id', dealId)
    .order('title')
    .throwOnError();

  return (data ?? []).map((item) => ({
    title: item.title,
    dueOn: item.due_at?.slice(0, 10) ?? null,
  }));
}

async function signedLoiMilestone(dealId: string) {
  await appendDealEvent(account.admin, {
    dealId,
    aggregateType: 'deal_milestone',
    aggregateId: crypto.randomUUID(),
    eventType: 'deal_milestone.set',
    payload: { kind: 'loi_signed', target_on: null, actual_on: SIGNED_ON },
  });
}

async function schedulesOf(dealId: string) {
  const { data } = await account.admin
    .from('diligence_schedule')
    .select('id, start_date, created_by')
    .eq('deal_id', dealId)
    .throwOnError();

  return data ?? [];
}

async function weeksOf(scheduleId: string) {
  const { data } = await account.admin
    .from('schedule_week')
    .select('week_no')
    .eq('schedule_id', scheduleId)
    .throwOnError();

  return data ?? [];
}

async function targetApaDateOf(dealId: string) {
  const { data } = await account.admin
    .from('deal_milestone')
    .select('target_on')
    .eq('deal_id', dealId)
    .eq('kind', 'apa_signing')
    .maybeSingle()
    .throwOnError();

  return data?.target_on ?? null;
}

describe('setUpDiligenceOnLoiSigned (integration)', () => {
  it('starts the schedule on the signed date and targets the APA diligence_days later', async () => {
    const dealId = await dealWithAcceptedOffer(45);

    await setUpDiligenceOnLoiSigned(account.admin, {
      dealId,
      signedOn: SIGNED_ON,
    }, VIA);

    const [schedule] = await schedulesOf(dealId);
    expect(schedule?.start_date).toBe(SIGNED_ON);
    expect(schedule?.created_by).toBeNull();
    expect(await weeksOf(schedule!.id)).toHaveLength(6);
    expect(await targetApaDateOf(dealId)).toBe('2026-11-19');
  });

  it('sets no target APA date when the accepted offer has no diligence_days', async () => {
    const dealId = await dealWithAcceptedOffer(null);

    await setUpDiligenceOnLoiSigned(account.admin, {
      dealId,
      signedOn: SIGNED_ON,
    }, VIA);

    expect(await schedulesOf(dealId)).toHaveLength(1);
    expect(await targetApaDateOf(dealId)).toBeNull();
  });

  it('creates one schedule however many times the signing is handled', async () => {
    const dealId = await dealWithAcceptedOffer(45);

    await setUpDiligenceOnLoiSigned(account.admin, {
      dealId,
      signedOn: SIGNED_ON,
    }, VIA);
    await setUpDiligenceOnLoiSigned(account.admin, {
      dealId,
      signedOn: SIGNED_ON,
    }, VIA);

    expect(await schedulesOf(dealId)).toHaveLength(1);
  });

  it('leaves a schedule the deal already has untouched', async () => {
    const dealId = await dealWithAcceptedOffer(45);
    await account.admin
      .from('diligence_schedule')
      .insert({
        account_id: account.accountId,
        deal_id: dealId,
        start_date: '2026-09-01',
      })
      .throwOnError();

    await setUpDiligenceOnLoiSigned(account.admin, {
      dealId,
      signedOn: SIGNED_ON,
    }, VIA);

    const schedules = await schedulesOf(dealId);
    expect(schedules.map((schedule) => schedule.start_date)).toEqual([
      '2026-09-01',
    ]);
  });

  it("applies the team's default diligence checklist, due relative to the signed date", async () => {
    await defaultDiligenceTemplate();
    const dealId = await dealWithAcceptedOffer(45);
    await signedLoiMilestone(dealId);

    await setUpDiligenceOnLoiSigned(account.admin, {
      dealId,
      signedOn: SIGNED_ON,
    }, VIA);

    expect(await checklistOf(dealId)).toEqual([
      { title: 'Leases', dueOn: '2026-10-19' },
      { title: 'Tax returns', dueOn: '2026-10-12' },
    ]);
  });

  it('applies the checklist once however many times the signing is handled', async () => {
    await defaultDiligenceTemplate();
    const dealId = await dealWithAcceptedOffer(45);
    await signedLoiMilestone(dealId);

    await setUpDiligenceOnLoiSigned(account.admin, {
      dealId,
      signedOn: SIGNED_ON,
    }, VIA);
    await setUpDiligenceOnLoiSigned(account.admin, {
      dealId,
      signedOn: SIGNED_ON,
    }, VIA);

    expect(await checklistOf(dealId)).toHaveLength(2);
  });

  it('still creates the schedule for a team with no default diligence template', async () => {
    await clearStarterDiligenceDefault();
    const dealId = await dealWithAcceptedOffer(45);

    await setUpDiligenceOnLoiSigned(account.admin, {
      dealId,
      signedOn: SIGNED_ON,
    }, VIA);

    expect(await checklistOf(dealId)).toEqual([]);
    expect(await schedulesOf(dealId)).toHaveLength(1);
  });
});
