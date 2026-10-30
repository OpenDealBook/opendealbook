import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Json } from '@odb/supabase';
import {
  admin,
  cleanUp,
  newDeal,
  provisionPerson,
  provisionTeam,
} from '@odb/seller-rooms/test-support/world.ts';

import { setUpLoiSigned } from './loi-signed-setup';
import { seedLoiSignedTargets } from './loi-signed-targets';

const SIGNED_ON = '2026-10-05';
const SERVICE = { actor: { actorKind: 'service', actorVia: 'documenso' } } as const;

type Person = Awaited<ReturnType<typeof provisionPerson>>;

let owner: Person;
let teamId: string;

beforeAll(async () => {
  owner = await provisionPerson();
  teamId = await provisionTeam(owner, 'LOI Setup Partners');
});

afterAll(async () => {
  await cleanUp([teamId]);
});

beforeEach(async () => {
  await clearDiligenceDefault();
});

function signLoi(dealId: string) {
  return setUpLoiSigned(admin, { dealId, signedOn: SIGNED_ON }, SERVICE);
}

function appendEvent(
  dealId: string,
  aggregateType: string,
  aggregateId: string,
  eventType: string,
  payload: Json,
) {
  return admin
    .rpc('append_deal_event', {
      p_deal_id: dealId,
      p_aggregate_type: aggregateType,
      p_aggregate_id: aggregateId,
      p_event_type: eventType,
      p_payload: payload,
      p_actor_kind: 'service',
    })
    .throwOnError();
}

async function dealWithAcceptedOffer(
  diligenceDays: number | null,
  exclusivityDays: number | null = null,
) {
  const dealId = await newDeal(teamId, owner);
  const offerId = crypto.randomUUID();
  await appendEvent(dealId, 'offer', offerId, 'offer.drafted', {});
  await appendEvent(dealId, 'offer', offerId, 'offer.version_added', {
    version_id: crypto.randomUUID(),
    number: 1,
    author_side: 'buyer',
    purchase_price: 1_000_000,
    diligence_days: diligenceDays,
    exclusivity_days: exclusivityDays,
    terms: {},
  });
  await appendEvent(dealId, 'offer', offerId, 'offer.accepted', {});

  return dealId;
}

async function clearDiligenceDefault() {
  await admin
    .from('checklist_template')
    .update({ is_default: false })
    .eq('account_id', teamId)
    .eq('kind', 'diligence')
    .throwOnError();
}

async function defaultDiligenceTemplate() {
  const { data: template } = await admin
    .from('checklist_template')
    .insert({
      account_id: teamId,
      name: 'Team diligence',
      kind: 'diligence',
      is_default: true,
    })
    .select('id')
    .single()
    .throwOnError();

  await admin
    .from('checklist_template_item')
    .insert([
      { template_id: template.id, title: 'Tax returns', due_offset_days: 7 },
      { template_id: template.id, title: 'Leases', due_offset_days: 14 },
    ])
    .throwOnError();
}

function writingBetweenReadAndAppend(write: () => Promise<unknown>) {
  return new Proxy(admin, {
    get(target, prop) {
      if (prop !== 'from') {
        const value = Reflect.get(target, prop);
        return typeof value === 'function' ? value.bind(target) : value;
      }

      return (table: 'deal_milestone') => {
        const builder = target.from(table);
        if (table !== 'deal_milestone') {
          return builder;
        }

        return {
          select: (...args: Parameters<typeof builder.select>) => {
            const query = builder.select(...args);
            const run = query.then.bind(query);
            query.then = (fulfilled, rejected) =>
              run(async (result) => {
                await write();
                return result;
              }).then(fulfilled, rejected);
            return query;
          },
        };
      };
    },
  });
}

async function signedLoiMilestone(dealId: string) {
  await appendEvent(dealId, 'deal_milestone', crypto.randomUUID(), 'deal_milestone.set', {
    kind: 'loi_signed',
    target_on: null,
    actual_on: SIGNED_ON,
  });
}

async function checklistOf(dealId: string) {
  const { data } = await admin
    .from('checklist_item')
    .select('title, due_at')
    .eq('deal_id', dealId)
    .is('removed_at', null)
    .order('title')
    .throwOnError();

  return data.map((item) => ({
    title: item.title,
    dueOn: item.due_at?.slice(0, 10) ?? null,
  }));
}

async function schedulesOf(dealId: string) {
  const { data } = await admin
    .from('diligence_schedule')
    .select('id, start_date, created_by')
    .eq('deal_id', dealId)
    .throwOnError();

  return data;
}

async function weeksOf(scheduleId: string) {
  const { data } = await admin
    .from('schedule_week')
    .select('week_no')
    .eq('schedule_id', scheduleId)
    .throwOnError();

  return data;
}

async function targetsOf(dealId: string) {
  const { data } = await admin
    .from('deal_milestone')
    .select('id, kind, target_on, actual_on')
    .eq('deal_id', dealId)
    .in('kind', ['apa_signing', 'exclusivity_end'])
    .order('kind')
    .throwOnError();

  return data;
}

async function targetDatesOf(dealId: string) {
  return (await targetsOf(dealId)).map(({ kind, target_on, actual_on }) => ({
    kind,
    target_on,
    actual_on,
  }));
}

const SEEDED = [
  { kind: 'exclusivity_end', target_on: '2026-11-04', actual_on: null },
  { kind: 'apa_signing', target_on: '2026-11-19', actual_on: null },
];

describe('setUpLoiSigned as the service (integration)', () => {
  it('starts the schedule on the signed date and targets the APA diligence_days later', async () => {
    const dealId = await dealWithAcceptedOffer(45);

    await signLoi(dealId);

    const [schedule] = await schedulesOf(dealId);
    expect(schedule?.start_date).toBe(SIGNED_ON);
    expect(schedule?.created_by).toBeNull();
    expect(await weeksOf(schedule!.id)).toHaveLength(6);
    expect(await targetDatesOf(dealId)).toEqual([
      { kind: 'apa_signing', target_on: '2026-11-19', actual_on: null },
    ]);
  });

  it('sets no target APA date when the accepted offer has no diligence_days', async () => {
    const dealId = await dealWithAcceptedOffer(null);

    await signLoi(dealId);

    expect(await schedulesOf(dealId)).toHaveLength(1);
    expect(await targetDatesOf(dealId)).toEqual([]);
  });

  it('targets the end of exclusivity exclusivity_days after the signed date', async () => {
    const dealId = await dealWithAcceptedOffer(45, 30);

    await signLoi(dealId);

    expect(await targetDatesOf(dealId)).toEqual(SEEDED);
  });

  it('leaves the end of exclusivity unset when the accepted offer has no exclusivity_days', async () => {
    const dealId = await dealWithAcceptedOffer(45, null);

    await signLoi(dealId);

    expect((await targetDatesOf(dealId)).map(({ kind }) => kind)).toEqual([
      'apa_signing',
    ]);
  });

  it('targets each kind once however many times the signing is handled', async () => {
    const dealId = await dealWithAcceptedOffer(45, 30);

    await signLoi(dealId);
    await signLoi(dealId);

    expect(await targetDatesOf(dealId)).toEqual(SEEDED);
  });

  it('keeps a target the team moved when the signing is handled again', async () => {
    const dealId = await dealWithAcceptedOffer(45, 30);
    await signLoi(dealId);
    const exclusivityEnd = (await targetsOf(dealId)).find(
      ({ kind }) => kind === 'exclusivity_end',
    )!;
    await appendEvent(dealId, 'deal_milestone', exclusivityEnd.id, 'deal_milestone.set', {
      kind: 'exclusivity_end',
      target_on: '2026-12-15',
      actual_on: null,
    });

    await signLoi(dealId);

    expect(await targetDatesOf(dealId)).toEqual([
      { kind: 'exclusivity_end', target_on: '2026-12-15', actual_on: null },
      { kind: 'apa_signing', target_on: '2026-11-19', actual_on: null },
    ]);
  });

  it('keeps APA signing and exclusivity end targets the team set before the LOI was signed', async () => {
    const dealId = await dealWithAcceptedOffer(45, 30);
    for (const [kind, target_on] of [
      ['apa_signing', '2026-12-01'],
      ['exclusivity_end', '2026-12-15'],
    ]) {
      await appendEvent(dealId, 'deal_milestone', crypto.randomUUID(), 'deal_milestone.set', {
        kind,
        target_on,
        actual_on: null,
      });
    }

    await signLoi(dealId);

    expect(await schedulesOf(dealId)).toHaveLength(1);
    expect(await targetDatesOf(dealId)).toEqual([
      { kind: 'exclusivity_end', target_on: '2026-12-15', actual_on: null },
      { kind: 'apa_signing', target_on: '2026-12-01', actual_on: null },
    ]);
  });

  it('fills in targets missing after an earlier run failed past the schedule', async () => {
    const dealId = await dealWithAcceptedOffer(45, 30);
    await signLoi(dealId);
    for (const { id } of await targetsOf(dealId)) {
      await appendEvent(dealId, 'deal_milestone', id, 'deal_milestone.removed', {});
    }

    await signLoi(dealId);

    expect(await schedulesOf(dealId)).toHaveLength(1);
    expect(await targetDatesOf(dealId)).toEqual(SEEDED);
  });

  it('targets APA signing and exclusivity end for a deal whose schedule started before the signing, leaving that schedule untouched', async () => {
    const dealId = await dealWithAcceptedOffer(45, 30);
    await admin
      .from('diligence_schedule')
      .insert({ account_id: teamId, deal_id: dealId, start_date: '2026-09-01' })
      .throwOnError();

    await signLoi(dealId);

    expect((await schedulesOf(dealId)).map(({ start_date }) => start_date)).toEqual([
      '2026-09-01',
    ]);
    expect(await targetDatesOf(dealId)).toEqual(SEEDED);
  });

  it('creates one schedule however many times the signing is handled', async () => {
    const dealId = await dealWithAcceptedOffer(45);

    await signLoi(dealId);
    await signLoi(dealId);

    expect(await schedulesOf(dealId)).toHaveLength(1);
  });

  it("applies the team's default diligence checklist, due relative to the signed date", async () => {
    await defaultDiligenceTemplate();
    const dealId = await dealWithAcceptedOffer(45);
    await signedLoiMilestone(dealId);

    await signLoi(dealId);

    expect(await checklistOf(dealId)).toEqual([
      { title: 'Leases', dueOn: '2026-10-19' },
      { title: 'Tax returns', dueOn: '2026-10-12' },
    ]);
  });

  it('applies the checklist once however many times the signing is handled', async () => {
    await defaultDiligenceTemplate();
    const dealId = await dealWithAcceptedOffer(45);
    await signedLoiMilestone(dealId);

    await signLoi(dealId);
    await signLoi(dealId);

    expect(await checklistOf(dealId)).toHaveLength(2);
  });

  it('still creates the schedule for a team with no default diligence template', async () => {
    const dealId = await dealWithAcceptedOffer(45);

    await signLoi(dealId);

    expect(await checklistOf(dealId)).toEqual([]);
    expect(await schedulesOf(dealId)).toHaveLength(1);
  });

  it('keeps a target the team set between reading the targets and seeding them', async () => {
    const dealId = await dealWithAcceptedOffer(45, 30);
    const handSet = async () => {
      await appendEvent(dealId, 'deal_milestone', crypto.randomUUID(), 'deal_milestone.set', {
        kind: 'exclusivity_end',
        target_on: '2026-12-15',
        actual_on: null,
      });
    };

    await seedLoiSignedTargets(
      writingBetweenReadAndAppend(handSet),
      { dealId, signedOn: SIGNED_ON },
      SERVICE.actor,
    );

    expect(await targetDatesOf(dealId)).toEqual([
      { kind: 'exclusivity_end', target_on: '2026-12-15', actual_on: null },
      { kind: 'apa_signing', target_on: '2026-11-19', actual_on: null },
    ]);
  });

  it('does not bring the default checklist back after the team removed every item from it', async () => {
    await defaultDiligenceTemplate();
    const dealId = await dealWithAcceptedOffer(45);
    await signedLoiMilestone(dealId);
    await signLoi(dealId);
    const { data: items } = await admin
      .from('checklist_item')
      .select('id')
      .eq('deal_id', dealId)
      .throwOnError();
    for (const { id } of items) {
      await appendEvent(dealId, 'checklist_item', id, 'checklist_item.removed', {});
    }

    await signLoi(dealId);

    expect(await checklistOf(dealId)).toEqual([]);
  });
});
