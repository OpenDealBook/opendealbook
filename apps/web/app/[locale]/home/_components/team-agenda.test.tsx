// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { AgendaRow } from '../_lib/team-agenda';
import { TeamAgenda } from './team-agenda';

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

function render(rows: AgendaRow[], wholeTeam: boolean | null = null) {
  const container = document.createElement('div');
  container.innerHTML = renderToStaticMarkup(
    <TeamAgenda
      account={'acme'}
      rows={rows}
      wholeTeam={wholeTeam}
      showsLenders={false}
    />,
  );
  return container;
}

function headings(container: HTMLElement) {
  return [...container.querySelectorAll('h2')].map((h) => h.textContent);
}

describe('TeamAgenda', () => {
  it('lists the sections that have rows in agenda order', () => {
    const container = render([
      row({
        section: 'signoff',
        kind: 'signoff',
        title: 'apa',
        detail: 'seller',
      }),
      row({
        section: 'activity',
        kind: 'seller_upload',
        title: 'P&L 2025.pdf',
      }),
      row({ section: 'overdue' }),
    ]);

    expect(headings(container)).toEqual([
      'Overdue',
      'New since your last visit',
      'Counsel sign-offs pending',
    ]);
  });

  it('links each row to its item and names its deal', () => {
    const container = render([
      row({
        section: 'due_soon',
        kind: 'checklist',
        item_id: 'c-9',
        title: 'Tax returns',
      }),
    ]);
    const link = container.querySelector(
      'a[href="/home/acme/deals/deal-1/diligence#checklist-item-c-9"]',
    );

    expect(link?.textContent).toContain('Tax returns');
    expect(link?.textContent).toContain('Brennan Climate');
  });

  it('says what each outside or deal-level row is about', () => {
    const text = render([
      row({
        section: 'activity',
        kind: 'lender_form',
        room_id: 'r-1',
        title: 'Personal financial statement',
      }),
      row({
        section: 'activity',
        kind: 'counsel_decision',
        title: 'changes_needed',
        detail: 'buyer',
      }),
      row({
        section: 'deadline',
        kind: 'milestone',
        title: null,
        detail: 'financing_contingency',
      }),
      row({
        section: 'deadline',
        kind: 'must_close_by',
        title: null,
        detail: 'Lease ends',
      }),
      row({
        section: 'quiet_lender',
        kind: 'quiet_lender',
        room_id: 'r-1',
        title: 'TA Bank',
        detail: '12',
      }),
      row({
        section: 'signoff',
        kind: 'signoff',
        title: 'apa',
        detail: 'seller',
      }),
    ]).textContent;

    expect(text).toContain('Lender form: Personal financial statement');
    expect(text).toContain("Buyer's counsel: Changes needed");
    expect(text).toContain('Financing contingency');
    expect(text).toContain('Must close by: Lease ends');
    expect(text).toContain('TA Bank, quiet 12 days');
    expect(text).toContain("APA sign-off from seller's counsel");
  });

  it('names an exclusivity end and flags it when it has lapsed', () => {
    const exclusivityEnd = (item_id: string, lapsed: boolean) =>
      row({
        section: 'deadline',
        kind: 'milestone',
        item_id,
        title: null,
        detail: 'exclusivity_end',
        lapsed,
      });
    const container = render([
      exclusivityEnd('lapsed', true),
      exclusivityEnd('ahead', false),
    ]);
    const rowText = (id: string) =>
      container.querySelector(`a[href$="#milestone-${id}"]`)?.textContent;

    expect(rowText('lapsed')).toContain('Exclusivity ends');
    expect(rowText('lapsed')).toContain('Lapsed');
    expect(rowText('ahead')).toContain('Exclusivity ends');
    expect(rowText('ahead')).not.toContain('Lapsed');
  });

  it('exposes the full deal name on a row whose deal name may be cut off', () => {
    const name = 'Brennan Climate Services of Greater Tampa Bay and Sarasota';
    const container = render([row({ deal_name: name })]);

    expect(container.querySelector(`[title="${name}"]`)?.textContent).toBe(
      name,
    );
  });

  it('says so when nothing needs the person today', () => {
    expect(render([]).textContent).toContain('Nothing needs you today.');
  });

  it('lets a manager switch between their own agenda and the whole team', () => {
    const container = render([], false);
    const current = container.querySelector('a[aria-current="page"]');

    expect(current?.textContent).toBe('Mine');
    expect(container.querySelector('a[href="?scope=team"]')?.textContent).toBe(
      'Whole team',
    );
  });

  it('offers no whole-team view to someone who is not a manager', () => {
    expect(render([]).textContent).not.toContain('Whole team');
  });
});
