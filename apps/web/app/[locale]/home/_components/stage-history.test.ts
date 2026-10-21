import { describe, expect, it } from 'vitest';

import type { Tables } from '@odb/supabase';

import { buildTimeline } from './stage-history';

function event(fields: Partial<Tables<'deal_event'>>): Tables<'deal_event'> {
  return {
    id: crypto.randomUUID(),
    global_seq: 1,
    account_id: 'a1',
    deal_id: 'd1',
    aggregate_type: 'deal',
    aggregate_id: 'd1',
    event_type: 'deal.created',
    payload: {},
    actor_kind: 'user',
    actor_ref: null,
    actor_via: 'web',
    deal_seq: 1,
    aggregate_seq: 1,
    created_at: '2026-10-01T12:00:00Z',
    ...fields,
  };
}

describe('stage history', () => {
  it('shows a sent deal update by its subject', () => {
    const entries = buildTimeline(
      [
        event({ payload: { stage: 'lead' } }),
        event({
          aggregate_type: 'deal_update',
          aggregate_id: 'u1',
          event_type: 'deal_update.sent',
          payload: { subject: 'Closing moves to December' },
          actor_kind: 'service',
          deal_seq: 2,
          created_at: '2026-10-02T12:00:00Z',
        }),
      ],
      (key) => key.toUpperCase(),
      new Map(),
    );

    expect(entries.map((entry) => [entry.label, entry.at])).toEqual([
      ['Created in LEAD', '2026-10-01T12:00:00Z'],
      ['Update sent: Closing moves to December', '2026-10-02T12:00:00Z'],
    ]);
  });

  it('names the person who made each change', () => {
    const entries = buildTimeline(
      [
        event({ payload: { stage: 'sourcing' }, actor_ref: 'u-morgan' }),
        event({
          event_type: 'deal.stage_changed',
          payload: { stage: 'loi' },
          actor_ref: 'u-priya',
          deal_seq: 2,
        }),
      ],
      (key) => key.toUpperCase(),
      new Map([
        ['u-morgan', 'Morgan Reyes'],
        ['u-priya', 'Priya Shah'],
      ]),
    );

    expect(entries.map((entry) => [entry.label, entry.actor])).toEqual([
      ['Created in SOURCING', 'Morgan Reyes'],
      ['SOURCING -> LOI', 'Priya Shah'],
    ]);
  });
});
