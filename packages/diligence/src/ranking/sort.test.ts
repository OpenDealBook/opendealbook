import { describe, expect, it } from 'vitest';

import type { Tables } from '@odb/supabase';

import { dealBlockers, sortByRisk } from './sort';

type ChecklistItem = Tables<'checklist_item'>;

function item(overrides: Partial<ChecklistItem>): ChecklistItem {
  return {
    account_id: 'acct-1',
    answer: null,
    artifact_id: null,
    artifact_type: null,
    category: null,
    created_at: null,
    created_by: null,
    deal_id: 'deal-1',
    deal_killer: false,
    due_at: null,
    due_offset_days: null,
    id: 'item',
    importance: null,
    kind: null,
    offer_term_key: null,
    outcome: null,
    owner_role: null,
    owner_user_id: null,
    priority: 0,
    received_at: null,
    removed_at: null,
    requested_at: null,
    reviewed_at: null,
    reviewed_by: null,
    schedule_week_id: null,
    status: 'not_started',
    title: 'untitled',
    updated_at: null,
    updated_by: null,
    ...overrides,
  };
}

describe('sortByRisk', () => {
  it('puts deal-killers first, then higher priority, then earlier due date', () => {
    const items = [
      item({ id: 'low', priority: 1, deal_killer: false }),
      item({
        id: 'killer-late',
        priority: 5,
        deal_killer: true,
        due_at: '2026-03-01',
      }),
      item({
        id: 'killer-early',
        priority: 5,
        deal_killer: true,
        due_at: '2026-01-01',
      }),
      item({ id: 'high', priority: 9, deal_killer: false }),
    ];

    const order = sortByRisk(items).map((row) => row.id);

    expect(order).toEqual(['killer-early', 'killer-late', 'high', 'low']);
  });
});

describe('dealBlockers', () => {
  it('returns only deal-killers with a rejected or follow_up outcome', () => {
    const items = [
      item({ id: 'blocker-rejected', deal_killer: true, outcome: 'rejected' }),
      item({ id: 'blocker-follow', deal_killer: true, outcome: 'follow_up' }),
      item({ id: 'killer-accepted', deal_killer: true, outcome: 'accepted' }),
      item({ id: 'non-killer', deal_killer: false, outcome: 'rejected' }),
    ];

    const ids = dealBlockers(items).map((row) => row.id);

    expect(ids).toEqual(['blocker-rejected', 'blocker-follow']);
  });
});
