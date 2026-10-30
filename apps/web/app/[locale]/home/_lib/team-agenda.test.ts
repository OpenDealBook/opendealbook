import { describe, expect, it } from 'vitest';

import { type AgendaRow, agendaHref } from './team-agenda';

function row(overrides: Partial<AgendaRow>): AgendaRow {
  return {
    section: 'overdue',
    kind: 'todo',
    item_id: 'item-1',
    deal_id: 'deal-1',
    deal_name: 'Brennan Climate',
    room_id: null,
    title: 'Call the broker',
    detail: null,
    at: '2026-10-17T00:00:00+00:00',
    lapsed: false,
    ...overrides,
  };
}

describe('agendaHref', () => {
  it('opens a deal to-do on the deal to-dos page at that to-do', () => {
    expect(agendaHref('acme', row({ kind: 'todo' }), false)).toBe(
      '/home/acme/deals/deal-1/todos#todo-item-1',
    );
  });

  it('opens a to-do with no deal on the team to-dos page', () => {
    expect(
      agendaHref('acme', row({ kind: 'todo', deal_id: null }), false),
    ).toBe('/home/acme/todos#todo-item-1');
  });

  it('opens a lender ask and a lender form at their request page', () => {
    expect(
      agendaHref('acme', row({ kind: 'lender_ask', room_id: 'room-1' }), true),
    ).toBe('/home/acme/deals/deal-1/lenders/room-1/requests/asks/item-1');
    expect(
      agendaHref('acme', row({ kind: 'lender_form', room_id: 'room-1' }), true),
    ).toBe('/home/acme/deals/deal-1/lenders/room-1/requests/forms/item-1');
  });

  it('opens a seller upload in the data room window', () => {
    expect(
      agendaHref(
        'acme',
        row({ kind: 'seller_upload', item_id: 'doc-1' }),
        false,
      ),
    ).toBe('/deal-windows/acme/deal-1/data-room/view?doc=doc-1');
  });

  it('opens a must close by date on the Lenders tab when the caller sees it, else on the deal overview', () => {
    const deadline = row({ kind: 'must_close_by', item_id: 'deal-1' });

    expect(agendaHref('acme', deadline, true)).toBe(
      '/home/acme/deals/deal-1/lenders#must-close-by-deal-1',
    );
    expect(agendaHref('acme', deadline, false)).toBe('/home/acme/deals/deal-1');
  });

  it('opens a quiet lender at its room', () => {
    expect(
      agendaHref(
        'acme',
        row({ kind: 'quiet_lender', item_id: 'room-1', room_id: 'room-1' }),
        true,
      ),
    ).toBe('/home/acme/deals/deal-1/lenders/room-1');
  });

  it('opens each item on the deal tab that shows it', () => {
    const at = (kind: AgendaRow['kind']) =>
      agendaHref('acme', row({ kind, item_id: 'x-1' }), false);

    expect(at('checklist')).toBe(
      '/home/acme/deals/deal-1/diligence#checklist-item-x-1',
    );
    expect(at('seller_answer')).toBe(
      '/home/acme/deals/deal-1/parties#seller-question-x-1',
    );
    expect(at('counsel_message')).toBe(
      '/home/acme/deals/deal-1/parties#counsel-message-x-1',
    );
    expect(at('counsel_decision')).toBe(
      '/home/acme/deals/deal-1/documents#contract-review-x-1',
    );
    expect(at('signoff')).toBe(
      '/home/acme/deals/deal-1/documents#contract-review-x-1',
    );
    expect(at('deal_update')).toBe('/home/acme/deals/deal-1#deal-update-x-1');
    expect(at('milestone')).toBe('/home/acme/deals/deal-1#milestone-x-1');
  });
});
