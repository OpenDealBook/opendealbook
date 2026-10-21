// @vitest-environment jsdom
import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Tables } from '@odb/supabase';

vi.mock('@odb/deals/server', () => ({
  addChecklistItem: vi.fn(),
  applyChecklistTemplate: vi.fn(),
  updateChecklistItemStatus: vi.fn(),
  setChecklistItemDetails: vi.fn(),
  setChecklistItemWaitingOn: vi.fn(),
  postChecklistNote: vi.fn(),
  linkChecklistDocument: vi.fn(),
}));
vi.mock('@odb/seller-rooms/questions/actions.ts', () => ({
  requestChecklistItemFromSeller: vi.fn(),
}));
vi.mock('@odb/supabase/hooks', () => ({ useSupabase: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  useParams: () => ({ account: 'acme', id: 'd-1' }),
}));

import {
  addChecklistItem,
  linkChecklistDocument,
  postChecklistNote,
  setChecklistItemDetails,
  setChecklistItemWaitingOn,
  updateChecklistItemStatus,
} from '@odb/deals/server';
import { requestChecklistItemFromSeller } from '@odb/seller-rooms/questions/actions.ts';
import { useSupabase } from '@odb/supabase/hooks';

import { ChecklistSection } from './checklist-section';
import {
  alerts,
  field,
  buttons,
  linkTo,
  press,
  settle,
  submit,
  type,
} from './lender-test-kit';

function item(
  overrides: Partial<Tables<'checklist_item'>>,
): Tables<'checklist_item'> {
  return {
    id: 'i-1',
    deal_id: 'd-1',
    title: 'Tax returns',
    owner_user_id: null,
    due_offset_days: null,
    due_set_manually: false,
    kind: 'diligence',
    status: 'not_started',
    outcome: null,
    owner_role: null,
    importance: null,
    due_at: null,
    review_due_at: null,
    ...overrides,
  } as Tables<'checklist_item'>;
}

let container: HTMLDivElement;
let root: Root;

async function render(items: Tables<'checklist_item'>[]) {
  await act(async () => {
    root.render(<ChecklistSection items={items} />);
  });
}

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-18T12:00:00Z'));
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  rows = {};
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe('ChecklistSection due dates', () => {
  it('labels the Due and Review by columns', async () => {
    await render([item({})]);

    const headers = [...container.querySelectorAll('th')].map(
      (th) => th.textContent,
    );

    expect(headers).toContain('Due');
    expect(headers).toContain('Review by');
  });

  it('shows the due date in its field and the review by date as a long date', async () => {
    await render([
      item({
        due_at: '2026-10-30T00:00:00Z',
        review_due_at: '2026-11-05T00:00:00Z',
      }),
    ]);

    expect(field('Due date for Tax returns').value).toBe('2026-10-30');
    expect(container.textContent).toContain('November 5, 2026');
    expect(container.querySelector('.text-destructive')).toBeNull();
  });

  it('marks an open item past its due date Overdue in red', async () => {
    await render([item({ due_at: '2026-10-01T00:00:00Z' })]);

    expect(container.querySelector('.text-destructive')?.textContent).toBe(
      'Overdue',
    );
  });

  it.each(['received', 'reviewed'] as const)(
    'does not show a %s item past its due date in red',
    async (status) => {
      await render([item({ status, due_at: '2026-10-01T00:00:00Z' })]);

      expect(container.querySelector('.text-destructive')).toBeNull();
      expect(container.querySelector('table')?.textContent).not.toContain(
        'Overdue',
      );
    },
  );

  it('shows a past review by date in red until the item is reviewed', async () => {
    await render([
      item({ status: 'received', review_due_at: '2026-10-01T00:00:00Z' }),
    ]);

    const red = container.querySelector('.text-destructive');

    expect(red?.textContent).toContain('October 1, 2026');
    expect(red?.textContent).toContain('Overdue');
  });

  it('does not show a past review by date in red once reviewed', async () => {
    await render([
      item({ status: 'reviewed', review_due_at: '2026-10-01T00:00:00Z' }),
    ]);

    expect(container.querySelector('.text-destructive')).toBeNull();
  });
});

let rows: Record<string, unknown[]> = {};

function signedInAs(userId: string) {
  vi.mocked(useSupabase).mockReturnValue({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: rows[table] ?? [] }),
        }),
      }),
    }),
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: userId } } }),
    },
    rpc: () =>
      Promise.resolve({
        data: [
          {
            user_id: 'u-me',
            name: 'Priya Shah',
            entries: [{ source: 'team' }],
          },
          {
            user_id: 'u-morgan',
            name: 'Morgan Reyes',
            entries: [{ source: 'team' }],
          },
          {
            user_id: 'u-walt',
            name: 'Walt Brennan',
            entries: [{ source: 'seller_room' }],
          },
        ],
      }),
  } as unknown as ReturnType<typeof useSupabase>);
}

async function renderForDeal(items: Tables<'checklist_item'>[]) {
  signedInAs('u-me');
  await act(async () => {
    root.render(
      <ChecklistSection items={items} dealId={'d-1'} accountId={'a-1'} />,
    );
  });
  await settle();
}

function select(label: string): HTMLSelectElement {
  return container.querySelector<HTMLSelectElement>(
    `select[aria-label="${label}"]`,
  )!;
}

function chosen(label: string): string | undefined {
  return select(label).selectedOptions[0]?.textContent ?? undefined;
}

function options(label: string): string[] {
  return [...select(label).options].map((option) => option.textContent ?? '');
}

async function pick(label: string, text: string) {
  const target = select(label);
  const option = [...target.options].find((each) => each.textContent === text)!;

  await act(async () => {
    target.value = option.value;
    target.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await settle();
}

async function setDate(label: string, value: string) {
  const target = field(label) as HTMLInputElement;

  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(target, value);
    target.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await settle();
}

function rowTitles(): string[] {
  return [...container.querySelectorAll('tbody tr td:first-child')].map(
    (cell) => cell.textContent ?? '',
  );
}

describe('ChecklistSection layout', () => {
  it('puts every category in one table with one header row', async () => {
    await render([
      item({ id: 'i-1', kind: 'diligence', title: 'Tax returns' }),
      item({ id: 'i-2', kind: 'closing', title: 'Bill of sale' }),
    ]);

    expect(container.querySelectorAll('table')).toHaveLength(1);
    expect(container.querySelectorAll('thead tr')).toHaveLength(1);
    expect(
      [...container.querySelectorAll('tbody th')].map((th) => th.textContent),
    ).toEqual(['Diligence', 'Closing']);
  });

  it('offers one status column with the review outcome folded in', async () => {
    await render([item({})]);

    expect(
      [...container.querySelectorAll('thead th')].map((th) => th.textContent),
    ).not.toContain('Outcome');
    expect(options('Status of Tax returns')).toEqual([
      'Not started',
      'Requested',
      'Received',
      'Reviewed: clean',
      'Reviewed: issue',
    ]);
  });

  it.each([
    ['not_started', null, 'Not started'],
    ['reviewed', 'accepted', 'Reviewed: clean'],
    ['reviewed', 'follow_up', 'Reviewed: issue'],
    ['reviewed', 'rejected', 'Reviewed: issue'],
  ] as const)(
    'shows %s with outcome %s as %s',
    async (status, outcome, text) => {
      await render([item({ status, outcome })]);

      expect(chosen('Status of Tax returns')).toBe(text);
    },
  );

  it('shows importance in sentence case', async () => {
    await render([item({ importance: 'nice_to_have' })]);

    expect(chosen('Importance of Tax returns')).toBe('Nice to have');
    expect(options('Importance of Tax returns')).toEqual([
      'Not set',
      'Required',
      'Nice to have',
      'Not applicable',
    ]);
  });
});

describe('ChecklistSection owners and filters', () => {
  const items = () => [
    item({ id: 'i-1', title: 'Tax returns', owner_user_id: 'u-me' }),
    item({
      id: 'i-2',
      title: 'Lease',
      owner_user_id: 'u-morgan',
      due_at: '2026-10-01T00:00:00Z',
    }),
    item({
      id: 'i-3',
      title: 'Payroll',
      status: 'received',
      review_due_at: '2026-10-02T00:00:00Z',
    }),
    item({
      id: 'i-4',
      title: 'Bank statements',
      due_at: '2026-11-01T00:00:00Z',
    }),
  ];

  it('names each item owner and offers only team members', async () => {
    await renderForDeal(items());

    expect(chosen('Owner of Tax returns')).toBe('Priya Shah');
    expect(chosen('Owner of Lease')).toBe('Morgan Reyes');
    expect(chosen('Owner of Payroll')).toBe('Not set');
    expect(options('Owner of Payroll')).toEqual([
      'Not set',
      'Priya Shah',
      'Morgan Reyes',
    ]);
  });

  it('shows only my items under Mine', async () => {
    await renderForDeal(items());

    await press('Mine');

    expect(rowTitles()).toEqual(['Tax returns']);
  });

  it('shows only items past their due or review by date under Overdue', async () => {
    await renderForDeal(items());

    await press('Overdue');

    expect(rowTitles()).toEqual(['Lease', 'Payroll']);
  });

  it('shows every item again under All', async () => {
    await renderForDeal(items());

    await press('Mine');
    await press('All');

    expect(rowTitles()).toEqual([
      'Tax returns',
      'Lease',
      'Payroll',
      'Bank statements',
    ]);
  });
});

describe('ChecklistSection unscheduled items', () => {
  it('asks for the LOI signed date on the deal overview when diligence items wait on it', async () => {
    await renderForDeal([
      item({ id: 'i-1', due_offset_days: 7 }),
      item({ id: 'i-2', due_offset_days: 14 }),
      item({ id: 'i-3', due_offset_days: 3, due_at: '2026-11-01T00:00:00Z' }),
      item({ id: 'i-4', due_offset_days: null }),
    ]);

    expect(linkTo('Set LOI signed date to schedule 2 items')).toBe(
      '/home/acme/deals/d-1#timeline',
    );
  });

  it('names the closing anchors for closing and post-close items', async () => {
    await render([
      item({ id: 'i-1', kind: 'closing', due_offset_days: -7 }),
      item({ id: 'i-2', kind: 'post_close', due_offset_days: 30 }),
    ]);

    const text = container.textContent;

    expect(text).toContain('Set target closing date to schedule 1 item');
    expect(text).toContain('Set closing date to schedule 1 item');
  });

  it('asks for nothing when every item is scheduled', async () => {
    await render([
      item({ due_offset_days: 7, due_at: '2026-11-01T00:00:00Z' }),
    ]);

    expect(container.textContent).not.toContain('to schedule');
  });
});

describe('ChecklistSection inline editing', () => {
  beforeEach(() => {
    vi.mocked(setChecklistItemDetails).mockResolvedValue({
      ok: true,
      value: undefined,
    } as never);
    vi.mocked(updateChecklistItemStatus).mockResolvedValue({
      ok: true,
      value: undefined,
    } as never);
  });

  const details = () =>
    vi.mocked(setChecklistItemDetails).mock.calls.at(-1)?.[0];
  const status = () =>
    vi.mocked(updateChecklistItemStatus).mock.calls.at(-1)?.[0];

  it('assigns an owner', async () => {
    await renderForDeal([item({})]);

    await pick('Owner of Tax returns', 'Morgan Reyes');

    expect(details()).toEqual({
      deal_id: 'd-1',
      id: 'i-1',
      owner_user_id: 'u-morgan',
    });
  });

  it('clears the owner', async () => {
    await renderForDeal([item({ owner_user_id: 'u-me' })]);

    await pick('Owner of Tax returns', 'Not set');

    expect(details()).toEqual({
      deal_id: 'd-1',
      id: 'i-1',
      owner_user_id: null,
    });
  });

  it('sets and clears importance', async () => {
    await renderForDeal([item({})]);

    await pick('Importance of Tax returns', 'Required');
    expect(details()).toEqual({
      deal_id: 'd-1',
      id: 'i-1',
      importance: 'required',
    });

    await pick('Importance of Tax returns', 'Not set');
    expect(details()).toEqual({ deal_id: 'd-1', id: 'i-1', importance: null });
  });

  it('sets and clears a due date by hand', async () => {
    await renderForDeal([item({})]);

    await setDate('Due date for Tax returns', '2026-12-01');
    expect(details()).toEqual({
      deal_id: 'd-1',
      id: 'i-1',
      due_on: '2026-12-01',
    });

    await setDate('Due date for Tax returns', '');
    expect(details()).toEqual({ deal_id: 'd-1', id: 'i-1', due_on: null });
  });

  it('returns a hand-dated item to its scheduled date', async () => {
    await renderForDeal([
      item({ due_at: '2026-12-01T00:00:00Z', due_set_manually: true }),
    ]);

    await press('Use scheduled date');

    expect(details()).toEqual({
      deal_id: 'd-1',
      id: 'i-1',
      use_scheduled_date: true,
    });
  });

  it('offers the scheduled date only on a hand-dated item', async () => {
    await renderForDeal([item({ due_at: '2026-12-01T00:00:00Z' })]);

    expect(container.textContent).not.toContain('Use scheduled date');
  });

  it.each([
    ['Requested', { id: 'i-1', status: 'requested' }],
    ['Reviewed: clean', { id: 'i-1', status: 'reviewed', outcome: 'accepted' }],
    [
      'Reviewed: issue',
      { id: 'i-1', status: 'reviewed', outcome: 'follow_up' },
    ],
  ])('moves the status to %s', async (text, sent) => {
    await renderForDeal([item({})]);

    await pick('Status of Tax returns', text);

    expect(status()).toEqual(sent);
  });

  it('shows a refused change on its row', async () => {
    vi.mocked(setChecklistItemDetails).mockResolvedValue({
      ok: false,
      refusal:
        "Read-only members can't change checklist items. Ask a deal manager.",
    } as never);
    await renderForDeal([item({})]);

    await pick('Owner of Tax returns', 'Morgan Reyes');

    expect(alerts()).toEqual([
      "Read-only members can't change checklist items. Ask a deal manager.",
    ]);
  });
});

describe('ChecklistSection refusals', () => {
  it('shows a refused add next to the form and keeps the typed title', async () => {
    signedInAs('u-me');
    vi.mocked(addChecklistItem).mockResolvedValue({
      ok: false,
      refusal: 'Only deal managers can add checklist items. Ask Morgan Reyes.',
    } as never);
    await act(async () => {
      root.render(
        <ChecklistSection items={[]} dealId={'d-1'} accountId={'a-1'} />,
      );
    });

    await type('New item title', 'Lease assignment');
    await submit('New item title');
    await settle();

    expect(alerts()).toEqual([
      'Only deal managers can add checklist items. Ask Morgan Reyes.',
    ]);
    expect(field('New item title').value).toBe('Lease assignment');
  });
});

describe('ChecklistSection waiting on', () => {
  beforeEach(() => {
    vi.mocked(setChecklistItemWaitingOn).mockResolvedValue({
      ok: true,
      value: undefined,
    } as never);
  });

  it('sets who an item is waiting on, separate from its status', async () => {
    await renderForDeal([item({ status: 'requested' })]);

    expect(options('Waiting on for Tax returns')).toEqual([
      'Not set',
      'Us',
      'Seller',
      'Counsel',
      'Lender',
    ]);

    await pick('Waiting on for Tax returns', 'Seller');

    expect(vi.mocked(setChecklistItemWaitingOn).mock.calls.at(-1)?.[0]).toEqual(
      { deal_id: 'd-1', id: 'i-1', waiting_on: 'seller' },
    );
    expect(chosen('Status of Tax returns')).toBe('Requested');
  });

  it('shows only items waiting on the seller under Waiting on seller', async () => {
    await renderForDeal([
      item({ id: 'i-1', title: 'Tax returns', waiting_on: 'seller' }),
      item({ id: 'i-2', title: 'Lease', waiting_on: 'counsel' }),
      item({ id: 'i-3', title: 'Payroll' }),
    ]);

    await press('Waiting on seller');

    expect(rowTitles()).toEqual(['Tax returns']);
  });
});

describe('ChecklistSection item details', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rows = {
      dr_document: [
        { id: 'doc-1', name: 'returns-2025.pdf' },
        { id: 'doc-2', name: 'lease.pdf' },
      ],
      checklist_item_note: [
        {
          id: 'n-1',
          body: 'Seller says Friday',
          author_user_id: 'u-morgan',
          created_at: '2026-10-17T15:30:00Z',
        },
      ],
    };
    for (const action of [
      postChecklistNote,
      linkChecklistDocument,
      setChecklistItemWaitingOn,
    ]) {
      vi.mocked(action).mockResolvedValue({
        ok: true,
        value: undefined,
      } as never);
    }
    vi.mocked(requestChecklistItemFromSeller).mockResolvedValue({
      ok: true,
      value: 'q-1',
    });
  });

  async function openDetails() {
    await renderForDeal([item({})]);
    await press('Details for Tax returns');
    await settle();
  }

  it('shows the notes thread with each author and time', async () => {
    await openDetails();

    expect(container.textContent).toContain('Seller says Friday');
    expect(container.textContent).toContain('Morgan Reyes');
    expect(container.textContent).toContain('Oct 17, 2026');
  });

  it('posts a note to the thread', async () => {
    await openDetails();

    await type('Add a note', 'Chased by phone');
    await submit('Add a note');
    await settle();

    expect(vi.mocked(postChecklistNote).mock.calls.at(-1)?.[0]).toEqual({
      deal_id: 'd-1',
      id: 'i-1',
      body: 'Chased by phone',
    });
    expect(field('Add a note').value).toBe('');
  });

  it('links a document from the data room', async () => {
    await openDetails();

    expect(options('Document for Tax returns')).toEqual([
      'None linked',
      'returns-2025.pdf',
      'lease.pdf',
    ]);

    await pick('Document for Tax returns', 'lease.pdf');

    expect(vi.mocked(linkChecklistDocument).mock.calls.at(-1)?.[0]).toEqual({
      deal_id: 'd-1',
      id: 'i-1',
      document_id: 'doc-2',
    });
  });

  it('opens the linked document', async () => {
    await renderForDeal([item({ linked_document_id: 'doc-1' })]);
    await press('Details for Tax returns');
    await settle();

    expect(chosen('Document for Tax returns')).toBe('returns-2025.pdf');
    expect(buttons('Open')).toHaveLength(1);
  });

  it('unlinks the linked document', async () => {
    await renderForDeal([item({ linked_document_id: 'doc-1' })]);
    await press('Details for Tax returns');
    await settle();

    await pick('Document for Tax returns', 'None linked');

    expect(vi.mocked(linkChecklistDocument).mock.calls.at(-1)?.[0]).toEqual({
      deal_id: 'd-1',
      id: 'i-1',
      document_id: null,
    });
  });

  it('requests the item from the seller in the seller room', async () => {
    await openDetails();

    await press('Request from seller');
    expect(field('Question for the seller').value).toBe('Tax returns');
    await type('Details', 'The last three years, please.');
    await press('Send to the seller room');
    await settle();

    expect(
      vi.mocked(requestChecklistItemFromSeller).mock.calls.at(-1)?.[0],
    ).toEqual({
      checklistItemId: 'i-1',
      title: 'Tax returns',
      body: 'The last three years, please.',
    });
  });

  it('shows why the seller room refused the request', async () => {
    vi.mocked(requestChecklistItemFromSeller).mockResolvedValue({
      ok: false,
      refusal:
        "Walt Brennan hasn't joined the seller room yet; invite them first.",
    });
    await openDetails();

    await press('Request from seller');
    await press('Send to the seller room');
    await settle();

    expect(alerts()).toContain(
      "Walt Brennan hasn't joined the seller room yet; invite them first.",
    );
  });
});
