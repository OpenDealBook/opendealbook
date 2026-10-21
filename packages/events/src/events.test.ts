import { describe, expect, it, vi } from 'vitest';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@odb/supabase';

import {
  type DealMilestoneRemovedPayload,
  type DealMilestoneSetPayload,
  type DealEventInput,
  appendDealEvent,
  appendDealEvents,
} from './events';

function makeClient(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);
  const client = { rpc } as unknown as SupabaseClient<Database>;

  return { client, rpc };
}

describe('appendDealEvent', () => {
  it('maps the camelCase input to the rpc params and returns the rows', async () => {
    const rows = [{ deal_seq: 5, aggregate_seq: 2 }];
    const { client, rpc } = makeClient({ data: rows, error: null });

    const result = await appendDealEvent(client, {
      dealId: 'deal-1',
      aggregateType: 'checklist_item',
      aggregateId: 'ci-1',
      eventType: 'checklist_item.status_changed',
      payload: { status: 'received' },
      expectedAggregateSeq: 1,
    });

    expect(rpc).toHaveBeenCalledWith('append_deal_event', {
      p_deal_id: 'deal-1',
      p_aggregate_type: 'checklist_item',
      p_aggregate_id: 'ci-1',
      p_event_type: 'checklist_item.status_changed',
      p_payload: { status: 'received' },
      p_expected_aggregate_seq: 1,
    });
    expect(result).toEqual(rows);
  });

  it('omits p_expected_aggregate_seq when expectedAggregateSeq is not supplied', async () => {
    const { client, rpc } = makeClient({ data: [], error: null });

    await appendDealEvent(client, {
      dealId: 'deal-1',
      aggregateType: 'deal',
      aggregateId: 'deal-1',
      eventType: 'deal.created',
      payload: { account_id: 'acc-1' },
    });

    expect(rpc).toHaveBeenCalledWith('append_deal_event', {
      p_deal_id: 'deal-1',
      p_aggregate_type: 'deal',
      p_aggregate_id: 'deal-1',
      p_event_type: 'deal.created',
      p_payload: { account_id: 'acc-1' },
    });
  });

  it('forwards p_actor_kind when actorKind is supplied', async () => {
    const { client, rpc } = makeClient({ data: [], error: null });

    await appendDealEvent(client, {
      dealId: 'deal-1',
      aggregateType: 'deal',
      aggregateId: 'deal-1',
      eventType: 'deal.updated',
      payload: {},
      actorKind: 'service',
    });

    expect(rpc).toHaveBeenCalledWith('append_deal_event', {
      p_deal_id: 'deal-1',
      p_aggregate_type: 'deal',
      p_aggregate_id: 'deal-1',
      p_event_type: 'deal.updated',
      p_payload: {},
      p_actor_kind: 'service',
    });
  });

  it('forwards p_actor_via when actorVia is supplied', async () => {
    const { client, rpc } = makeClient({ data: [], error: null });

    await appendDealEvent(client, {
      dealId: 'deal-1',
      aggregateType: 'deal',
      aggregateId: 'deal-1',
      eventType: 'deal.stage_changed',
      payload: { stage: 'pa_accepted' },
      actorKind: 'service',
      actorVia: 'documenso',
    });

    expect(rpc).toHaveBeenCalledWith('append_deal_event', {
      p_deal_id: 'deal-1',
      p_aggregate_type: 'deal',
      p_aggregate_id: 'deal-1',
      p_event_type: 'deal.stage_changed',
      p_payload: { stage: 'pa_accepted' },
      p_actor_kind: 'service',
      p_actor_via: 'documenso',
    });
  });

  it('omits p_actor_kind when actorKind is not supplied', async () => {
    const { client, rpc } = makeClient({ data: [], error: null });

    await appendDealEvent(client, {
      dealId: 'deal-1',
      aggregateType: 'deal',
      aggregateId: 'deal-1',
      eventType: 'deal.updated',
      payload: {},
    });

    expect(rpc).toHaveBeenCalledWith('append_deal_event', {
      p_deal_id: 'deal-1',
      p_aggregate_type: 'deal',
      p_aggregate_id: 'deal-1',
      p_event_type: 'deal.updated',
      p_payload: {},
    });
  });

  it('throws when the rpc returns an error', async () => {
    const { client } = makeClient({ data: null, error: new Error('denied') });

    await expect(
      appendDealEvent(client, {
        dealId: 'deal-1',
        aggregateType: 'deal',
        aggregateId: 'deal-1',
        eventType: 'deal.updated',
        payload: {},
      }),
    ).rejects.toThrow('denied');
  });
});

describe('appendDealEvents', () => {
  it('maps each event to the snake_case batch shape and returns the rows', async () => {
    const rows = [
      { deal_seq: 6, aggregate_seq: 1 },
      { deal_seq: 7, aggregate_seq: 3 },
    ];
    const { client, rpc } = makeClient({ data: rows, error: null });

    const result = await appendDealEvents(client, 'deal-1', [
      {
        aggregateType: 'contract',
        aggregateId: 'c-1',
        eventType: 'contract.created',
        payload: { title: 'APA' },
      },
      {
        aggregateType: 'meeting',
        aggregateId: 'm-1',
        eventType: 'meeting.scheduled',
        payload: { at: '2026-02-01' },
        expectedAggregateSeq: 2,
      },
    ]);

    expect(rpc).toHaveBeenCalledWith('append_deal_events', {
      p_deal_id: 'deal-1',
      p_events: [
        {
          aggregate_type: 'contract',
          aggregate_id: 'c-1',
          event_type: 'contract.created',
          payload: { title: 'APA' },
        },
        {
          aggregate_type: 'meeting',
          aggregate_id: 'm-1',
          event_type: 'meeting.scheduled',
          payload: { at: '2026-02-01' },
          expected_aggregate_seq: 2,
        },
      ],
    });
    expect(result).toEqual(rows);
  });

  it('forwards actor_via per event, only for events that supply it', async () => {
    const { client, rpc } = makeClient({ data: [], error: null });

    await appendDealEvents(client, 'deal-1', [
      {
        aggregateType: 'contract',
        aggregateId: 'c-1',
        eventType: 'contract.created',
        payload: {},
        actorVia: 'documenso',
      },
      {
        aggregateType: 'meeting',
        aggregateId: 'm-1',
        eventType: 'meeting.scheduled',
        payload: {},
      },
    ]);

    expect(rpc).toHaveBeenCalledWith('append_deal_events', {
      p_deal_id: 'deal-1',
      p_events: [
        {
          aggregate_type: 'contract',
          aggregate_id: 'c-1',
          event_type: 'contract.created',
          payload: {},
          actor_via: 'documenso',
        },
        {
          aggregate_type: 'meeting',
          aggregate_id: 'm-1',
          event_type: 'meeting.scheduled',
          payload: {},
        },
      ],
    });
  });

  it('forwards actor_kind per event, only for events that supply it', async () => {
    const { client, rpc } = makeClient({ data: [], error: null });

    await appendDealEvents(client, 'deal-1', [
      {
        aggregateType: 'contract',
        aggregateId: 'c-1',
        eventType: 'contract.created',
        payload: { title: 'APA' },
        actorKind: 'service',
      },
      {
        aggregateType: 'meeting',
        aggregateId: 'm-1',
        eventType: 'meeting.scheduled',
        payload: { at: '2026-02-01' },
      },
    ]);

    expect(rpc).toHaveBeenCalledWith('append_deal_events', {
      p_deal_id: 'deal-1',
      p_events: [
        {
          aggregate_type: 'contract',
          aggregate_id: 'c-1',
          event_type: 'contract.created',
          payload: { title: 'APA' },
          actor_kind: 'service',
        },
        {
          aggregate_type: 'meeting',
          aggregate_id: 'm-1',
          event_type: 'meeting.scheduled',
          payload: { at: '2026-02-01' },
        },
      ],
    });
  });

  it('throws when the rpc returns an error', async () => {
    const { client } = makeClient({ data: null, error: new Error('conflict') });

    await expect(
      appendDealEvents(client, 'deal-1', [
        {
          aggregateType: 'deal',
          aggregateId: 'deal-1',
          eventType: 'deal.updated',
          payload: {},
        },
      ]),
    ).rejects.toThrow('conflict');
  });
});

describe('deal milestone events', () => {
  it('accepts a whole fixed or labeled custom milestone and rejects a mismatched label', () => {
    const closing: DealMilestoneSetPayload = {
      kind: 'closing',
      target_on: '2026-11-30',
      actual_on: null,
    };
    const custom: DealMilestoneSetPayload = {
      kind: 'custom',
      label: 'Landlord consent',
      target_on: null,
      actual_on: null,
      shared: true,
    };
    // @ts-expect-error a custom milestone needs a label
    const unlabeled: DealMilestoneSetPayload = { kind: 'custom', target_on: null, actual_on: null };
    // @ts-expect-error a fixed milestone takes no label
    const labeled: DealMilestoneSetPayload = { kind: 'closing', label: 'x', target_on: null, actual_on: null };
    // @ts-expect-error a set states both dates, so a date is never cleared by omission
    const partial: DealMilestoneSetPayload = { kind: 'closing', target_on: '2026-11-30' };
    const removed: DealMilestoneRemovedPayload = {};

    const events: DealEventInput[] = [
      { aggregateType: 'deal_milestone', aggregateId: 'm-1', eventType: 'deal_milestone.set', payload: closing },
      { aggregateType: 'deal_milestone', aggregateId: 'm-2', eventType: 'deal_milestone.set', payload: custom },
      { aggregateType: 'deal_milestone', aggregateId: 'm-1', eventType: 'deal_milestone.removed', payload: removed },
    ];

    expect([unlabeled, labeled, partial]).toHaveLength(3);
    expect(events.map((event) => event.eventType)).toEqual([
      'deal_milestone.set',
      'deal_milestone.set',
      'deal_milestone.removed',
    ]);
  });
});
