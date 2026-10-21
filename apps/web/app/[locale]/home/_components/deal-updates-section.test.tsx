// @vitest-environment jsdom
import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DealUpdatesBoard } from '@odb/deal-updates/queries.ts';

const server = vi.hoisted(() => ({
  create: vi.fn(),
  edit: vi.fn(),
  submit: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('@odb/deal-updates/actions.ts', () => ({
  createDealUpdate: server.create,
  editDealUpdate: server.edit,
  submitDealUpdate: server.submit,
}));
vi.mock('@odb/deal-updates/approval.ts', () => ({
  approveDealUpdate: server.approve,
  rejectDealUpdate: server.reject,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: server.refresh }),
}));

import { DealUpdatesSection } from './deal-updates-section';

const DONE = { ok: true, value: undefined };

const quiet = {
  phone: null,
  company: null,
  lender_room_id: null,
  room_closed: null,
  is_main: false,
};

const people: DealUpdatesBoard['people'] = [
  {
    user_id: 'u-lou',
    email: 'lou@northwind.test',
    name: 'Lou Lender',
    entries: [
      {
        ...quiet,
        source: 'lender_room',
        user_id: 'u-lou',
        contact_id: null,
        name: 'Lou Lender',
        side: 'lender',
        role: 'lender',
        lender_room_id: 'r-1',
        room_closed: false,
      },
    ],
  },
  {
    user_id: 'u-lia',
    email: 'lia@declined.test',
    name: 'Lia Lender',
    entries: [
      {
        ...quiet,
        source: 'lender_room',
        user_id: 'u-lia',
        contact_id: null,
        name: 'Lia Lender',
        side: 'lender',
        role: 'lender',
        lender_room_id: 'r-2',
        room_closed: true,
      },
    ],
  },
  {
    user_id: null,
    email: null,
    name: 'Ed Escrow',
    entries: [
      {
        ...quiet,
        source: 'contact',
        contact_id: 'c-ed',
        name: 'Ed Escrow',
        side: 'seller',
        role: 'broker',
      },
    ],
  },
  {
    user_id: 'u-tess',
    email: 'tess@team.test',
    name: 'Tess Team',
    entries: [
      {
        ...quiet,
        source: 'team',
        user_id: 'u-tess',
        contact_id: null,
        name: 'Tess Team',
        side: 'buyer',
        role: 'principal',
      },
    ],
  },
];

const myDraft = {
  id: 'up-1',
  subject: 'Closing date',
  body: 'Closing moves to December.',
  picks: { groups: ['lenders' as const], people: [] },
  status: 'draft' as const,
  version: 1,
  decision_note: null,
  mine: true,
  recipients: [],
};

const theirPending = {
  id: 'up-2',
  subject: 'Appraisal in',
  body: 'Came in at value.',
  picks: { groups: ['team' as const], people: ['lia@declined.test'] },
  status: 'pending' as const,
  version: 3,
  decision_note: null,
  mine: false,
  recipients: [],
};

let container: HTMLDivElement;
let root: Root;

function render(board: Partial<DealUpdatesBoard> = {}) {
  act(() =>
    root.render(
      <DealUpdatesSection
        dealId={'deal-1'}
        board={{
          people,
          canManage: true,
          canApprove: true,
          hasOtherApprover: true,
          updates: [myDraft, theirPending],
          ...board,
        }}
      />,
    ),
  );
}

function labelled<T extends HTMLElement>(label: string) {
  return container.querySelector<T>(`[aria-label="${label}"]`);
}

async function click(label: string) {
  await act(async () => {
    labelled(label)!.click();
  });
}

function type(label: string, value: string) {
  const field = labelled<HTMLInputElement | HTMLTextAreaElement>(label)!;
  const setter = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(field),
    'value',
  )!.set!;

  act(() => {
    setter.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function update(subject: string) {
  return [...container.querySelectorAll('li')].find((item) =>
    item.textContent?.includes(subject),
  )!;
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  for (const fn of Object.values(server)) {
    fn.mockReset();
  }
  server.create.mockResolvedValue({ ok: true, value: 'up-9' });
  server.edit.mockResolvedValue(DONE);
  server.submit.mockResolvedValue(DONE);
  server.approve.mockResolvedValue(DONE);
  server.reject.mockResolvedValue(DONE);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('DealUpdatesSection', () => {
  it('saves a draft addressed to groups and to people by name', async () => {
    render();

    type('Update subject', 'Rate lock');
    type('Update body', 'Extended through Friday.');
    await click('Send to Lenders');
    await click('Send to Lia Lender');
    await click('Save draft');

    expect(server.create).toHaveBeenCalledWith({
      dealId: 'deal-1',
      subject: 'Rate lock',
      body: 'Extended through Friday.',
      picks: { groups: ['lenders'], people: ['lia@declined.test'] },
    });
    expect(server.refresh).toHaveBeenCalled();
  });

  it('counts only people with open access in a group and marks the rest', () => {
    render();

    expect(
      labelled('Send to Lenders')!.closest('label')!.textContent,
    ).toContain('1');
    expect(
      labelled('Send to Lia Lender')!.closest('label')!.textContent,
    ).toContain('No open access');
  });

  it('shows people without an email as unreachable and not pickable', () => {
    render();

    expect(labelled('Send to Ed Escrow')).toBeNull();
    expect(container.textContent).toContain('Ed Escrow');
    expect(container.textContent).toContain('Unreachable, no email');
  });

  it("edits the author's draft with its saved content filled in", async () => {
    render();

    await click('Edit Closing date');
    expect(labelled<HTMLInputElement>('Update subject')!.value).toBe(
      'Closing date',
    );
    type('Update body', 'Closing moves to January.');
    await click('Save changes');

    expect(server.edit).toHaveBeenCalledWith({
      updateId: 'up-1',
      subject: 'Closing date',
      body: 'Closing moves to January.',
      picks: { groups: ['lenders'], people: [] },
    });
  });

  it("submits the author's draft for approval", async () => {
    render();

    await click('Submit Closing date');

    expect(server.submit).toHaveBeenCalledWith({ updateId: 'up-1' });
  });

  it('warns at submit when no one else can approve', () => {
    render({ hasOtherApprover: false });

    expect(update('Closing date').textContent).toContain(
      'This team has no other approver',
    );
  });

  it("offers no edit or submit on someone else's update", () => {
    render();

    expect(labelled('Edit Appraisal in')).toBeNull();
    expect(labelled('Submit Appraisal in')).toBeNull();
    expect(update('Appraisal in').textContent).toContain('Pending approval');
    expect(update('Appraisal in').textContent).toContain('Team');
    expect(update('Appraisal in').textContent).toContain('Lia Lender');
  });

  it('shows updates read-only to a team member without deals.manage', () => {
    render({ canManage: false, updates: [theirPending] });

    expect(container.textContent).toContain('Appraisal in');
    expect(labelled('Update subject')).toBeNull();
    expect(labelled('Save draft')).toBeNull();
  });

  it('shows a refusal from the server', async () => {
    server.create.mockResolvedValue({
      ok: false,
      refusal: 'Give the update a subject.',
    });
    render();

    await click('Save draft');

    expect(container.querySelector('[role="alert"]')!.textContent).toBe(
      'Give the update a subject.',
    );
  });

  it('shows an approver exactly who a pending update will be emailed to', () => {
    render();

    const recipients = labelled('Recipients of Appraisal in')!.textContent;

    expect(recipients).toContain('Lia Lender');
    expect(recipients).toContain('Tess Team');
    expect(recipients).not.toContain('Lou Lender');
  });

  it('approves the version and recipients the approver was shown', async () => {
    render();

    await click('Approve Appraisal in');

    expect(server.approve).toHaveBeenCalledWith({
      updateId: 'up-2',
      version: 3,
      recipients: ['lia@declined.test', 'tess@team.test'],
    });
    expect(server.refresh).toHaveBeenCalled();
  });

  it('rejects with the note the approver wrote', async () => {
    render();

    type('Rejection note for Appraisal in', 'Wrong figure.');
    await click('Reject Appraisal in');

    expect(server.reject).toHaveBeenCalledWith({
      updateId: 'up-2',
      version: 3,
      note: 'Wrong figure.',
    });
  });

  it('shows a refusal from the approval without reloading the page', async () => {
    server.approve.mockResolvedValue({
      ok: false,
      refusal: 'Recipients changed since you opened this. Review again.',
    });
    render();

    await click('Approve Appraisal in');

    expect(container.querySelector('[role="alert"]')!.textContent).toBe(
      'Recipients changed since you opened this. Review again.',
    );
    expect(server.refresh).not.toHaveBeenCalled();
  });

  it('offers no decision without the approve permission or on your own update', () => {
    render({
      canApprove: false,
      updates: [theirPending, { ...myDraft, status: 'pending' }],
    });
    expect(labelled('Approve Appraisal in')).toBeNull();

    render({ updates: [{ ...myDraft, status: 'pending' }] });
    expect(labelled('Approve Closing date')).toBeNull();
    expect(labelled('Reject Closing date')).toBeNull();
  });

  it('shows the rejection note on a rejected update', () => {
    render({
      updates: [
        { ...myDraft, status: 'rejected', decision_note: 'Wrong date.' },
      ],
    });

    expect(update('Closing date').textContent).toContain(
      'Rejected: Wrong date.',
    );
  });

  it('shows the whole team how delivery went for each recipient of an approved update', () => {
    render({
      canManage: false,
      canApprove: false,
      updates: [
        {
          ...theirPending,
          status: 'approved',
          recipients: [
            {
              email: 'lou@northwind.test',
              name: 'Lou Lender',
              deleted: false,
              delivery: { state: 'sent' },
            },
            {
              email: 'lia@declined.test',
              name: 'Lia Lender',
              deleted: false,
              delivery: { state: 'failed', error: 'Mailbox does not exist' },
            },
            {
              email: 'gone@ex.test',
              name: 'Gail Gone',
              deleted: true,
              delivery: { state: 'pending' },
            },
          ],
        },
      ],
    });

    const rows = [
      ...labelled('Delivery of Appraisal in')!.querySelectorAll('li'),
    ].map((row) => row.textContent);

    expect(rows).toEqual([
      expect.stringMatching(/Lou Lender.*Sent/),
      expect.stringMatching(/Lia Lender.*Failed: Mailbox does not exist/),
      expect.stringMatching(/Gail Gone \(deleted\).*Pending/),
    ]);
  });
});
