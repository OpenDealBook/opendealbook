import { describe, expect, it } from 'vitest';

import { describeDealEvent } from './activity';

const stageName = (key: string) => ({ loi: 'LOI submitted' })[key]!;

describe('describeDealEvent', () => {
  it.each([
    ['deal.stage_changed', { stage: 'loi' }, 'moved the deal to LOI submitted'],
    ['deal.resolved', { resolution: 'won' }, 'marked the deal won'],
    ['dr_document.added', { name: 'P&L 2025.pdf' }, 'uploaded "P&L 2025.pdf"'],
    [
      'deal_milestone.set',
      { kind: 'custom', label: 'Lease signed' },
      'set milestone "Lease signed"',
    ],
    ['deal_milestone.set', { kind: 'loi_signed' }, 'set a milestone date'],
    ['deal.loi_signed', { signed_on: '2026-10-02' }, 'LOI signed'],
    [
      'lender_room.went_quiet',
      { lender_name: 'Harbor Bank', days_silent: 5 },
      'Harbor Bank went quiet',
    ],
    [
      'checklist_item.details_set',
      { importance: 'required' },
      "changed a checklist item's owner, importance or due date",
    ],
    ['checklist_item.due_recomputed', {}, 'checklist item due recomputed'],
    [
      'checklist_item.waiting_on_set',
      { waiting_on: 'seller' },
      'marked a checklist item waiting on the seller',
    ],
    [
      'checklist_item.waiting_on_set',
      { waiting_on: 'us' },
      'marked a checklist item waiting on us',
    ],
    [
      'checklist_item.waiting_on_set',
      { waiting_on: null },
      'marked a checklist item waiting on no one',
    ],
    [
      'checklist_item.document_linked',
      { document_id: null },
      'unlinked the document from a checklist item',
    ],
    [
      'checklist_item.note_posted',
      { body: 'Seller says Friday' },
      'added a note to a checklist item',
    ],
    [
      'contract.extension_noted',
      { note: 'Seller agreed by email', noted_on: '2026-10-28' },
      'noted an LOI extension',
    ],
    [
      'contract.extension_rescheduled',
      { extends_to: '2026-12-01' },
      "changed an LOI extension's end date",
    ],
  ])('describes %s', (eventType, payload, expected) => {
    expect(describeDealEvent(eventType, payload, stageName)).toBe(expected);
  });
});
