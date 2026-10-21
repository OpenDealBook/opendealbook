// @vitest-environment jsdom
import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CommentThread } from '@odb/contracts';

import { fakeRealtime } from './fake-realtime';

const server = vi.hoisted(() => ({
  add: vi.fn(),
  reply: vi.fn(),
  resolve: vi.fn(),
  reopen: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('@odb/contracts/server', () => ({
  addContractComment: server.add,
  replyToContractComment: server.reply,
  resolveContractComment: server.resolve,
  reopenContractComment: server.reopen,
}));
const realtime = fakeRealtime();

vi.mock('@odb/supabase/hooks', () => ({
  useSupabase: () => realtime.client,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: server.refresh }),
}));

import { ContractComments } from './contract-comments';

let container: HTMLDivElement;
let root: Root;

const threads: CommentThread[] = [
  {
    id: 't1',
    author: { name: 'Olive Owner', role: 'team' },
    side: 'buyer',
    quotedText: 'Purchase price',
    body: 'Price needs to drop',
    internal: false,
    resolved: false,
    replies: [
      {
        id: 'r1',
        author: { name: 'Dana Lee', role: 'seller_counsel' },
        side: 'seller',
        quotedText: null,
        body: 'It will not',
        internal: false,
        resolved: false,
      },
      {
        id: 'r2',
        author: { name: 'Bea Law', role: 'buyer_counsel' },
        side: 'buyer',
        quotedText: null,
        body: 'Hold firm',
        internal: true,
        resolved: false,
      },
    ],
  },
  {
    id: 't2',
    author: { name: 'Sam Seller', role: 'seller' },
    side: 'seller',
    quotedText: null,
    body: 'Longer transition please',
    internal: false,
    resolved: true,
    replies: [],
  },
];

type Viewer = { side: 'buyer' | 'seller' } | null;

function show(viewer: Viewer, shown: CommentThread[] = threads) {
  act(() =>
    root.render(
      <ContractComments
        contractVersionId={'v1'}
        threads={shown}
        viewer={viewer}
      />,
    ),
  );
}

function thread(id: string) {
  return container.querySelector<HTMLElement>(`[data-thread="${id}"]`)!;
}

function field(scope: HTMLElement, label: string) {
  const labelled = [...scope.querySelectorAll('label')].find(
    (candidate) => candidate.textContent === label,
  );

  return labelled
    ? scope.querySelector<HTMLElement>(`#${CSS.escape(labelled.htmlFor)}`)
    : null;
}

function type(element: HTMLElement | null, value: string) {
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;

  act(() => {
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(
      element,
      value,
    );
    element!.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function button(scope: HTMLElement, text: string) {
  return (
    [...scope.querySelectorAll('button')].find(
      (candidate) => candidate.textContent === text,
    ) ?? null
  );
}

async function click(element: HTMLElement | null) {
  await act(async () => element!.click());
}

function newCommentForm() {
  return container.querySelector<HTMLElement>('[data-new-comment]')!;
}

beforeEach(() => {
  for (const action of [server.add, server.reply, server.resolve, server.reopen]) {
    action.mockReset();
    action.mockResolvedValue({ ok: true });
  }
  server.refresh.mockReset();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('ContractComments', () => {
  it('shows each thread oldest first, its author by name and role, and its replies', () => {
    show(null);

    const open = thread('t1');
    expect(open.textContent).toContain('Olive Owner (Buyer)');
    expect(open.querySelector('blockquote')?.textContent).toBe(
      'Purchase price',
    );
    expect(
      [...open.querySelectorAll('[data-comment]')].map((comment) => [
        comment.querySelector('[data-author]')?.textContent,
        comment.querySelector('[data-body]')?.textContent,
      ]),
    ).toEqual([
      ['Olive Owner (Buyer)', 'Price needs to drop'],
      ["Dana Lee (Seller's counsel)", 'It will not'],
      ["Bea Law (Buyer's counsel)", 'Hold firm'],
    ]);
    expect(
      container.querySelectorAll('[data-thread]')[1]?.getAttribute(
        'data-thread',
      ),
    ).toBe('t2');
  });

  it('marks internal comments', () => {
    show(null);

    expect(
      [...thread('t1').querySelectorAll('[data-comment]')].map((comment) =>
        comment.textContent?.includes('Internal'),
      ),
    ).toEqual([false, false, true]);
  });

  it('collapses a resolved thread to one line that opens on click', () => {
    show(null);

    const resolved = thread('t2').querySelector('details')!;
    expect(resolved.open).toBe(false);
    expect(resolved.querySelector('summary')?.textContent).toBe(
      'Resolved: Sam Seller (Seller)',
    );
    expect(thread('t1').querySelector('details')).toBeNull();
  });

  it('is read-only for a viewer who cannot post', () => {
    show(null);

    expect(container.querySelector('form')).toBeNull();
    expect(container.querySelector('button')).toBeNull();
  });

  it('posts a new comment with its quoted text, marked internal, for the buyer side', async () => {
    show({ side: 'buyer' });
    const form = newCommentForm();

    type(field(form, 'Quoted text (optional)'), 'Clause 4');
    type(field(form, 'Comment'), 'Cap is too low');
    await click(field(form, 'Internal (buyer side only)'));
    await click(button(form, 'Post comment'));

    expect(server.add).toHaveBeenCalledWith({
      contractVersionId: 'v1',
      quotedText: 'Clause 4',
      body: 'Cap is too low',
      internal: true,
    });
    expect(server.refresh).toHaveBeenCalled();
  });

  it('clears the comment box after a post when it was left untouched', async () => {
    show({ side: 'buyer' });
    const form = newCommentForm();

    type(field(form, 'Comment'), 'Cap is too low');
    await click(button(form, 'Post comment'));

    expect((field(form, 'Comment') as HTMLTextAreaElement).value).toBe('');
  });

  it('keeps what was typed while a post was in flight', async () => {
    let finishPost!: (outcome: { ok: true }) => void;
    server.add.mockReturnValue(
      new Promise((resolve) => {
        finishPost = resolve;
      }),
    );
    show({ side: 'buyer' });
    const form = newCommentForm();

    type(field(form, 'Comment'), 'Cap is too low');
    await click(button(form, 'Post comment'));
    type(field(form, 'Comment'), 'Also the basket is too wide');
    await act(async () => finishPost({ ok: true }));

    expect((field(form, 'Comment') as HTMLTextAreaElement).value).toBe(
      'Also the basket is too wide',
    );
  });

  it('sends no quoted text when none is given', async () => {
    show({ side: 'buyer' });
    const form = newCommentForm();

    type(field(form, 'Comment'), 'Looks fine');
    await click(button(form, 'Post comment'));

    expect(server.add).toHaveBeenCalledWith({
      contractVersionId: 'v1',
      quotedText: undefined,
      body: 'Looks fine',
      internal: false,
    });
  });

  it('never offers the seller side an internal comment', () => {
    show({ side: 'seller' });

    expect(field(newCommentForm(), 'Internal (buyer side only)')).toBeNull();
    expect(field(thread('t1'), 'Internal (buyer side only)')).toBeNull();
  });

  it('lets the buyer side reply internally', async () => {
    show({ side: 'buyer' });
    const open = thread('t1');

    type(field(open, 'Reply'), 'Between us, we can give');
    await click(field(open, 'Internal (buyer side only)'));
    await click(button(open, 'Reply'));

    expect(server.reply).toHaveBeenCalledWith({
      parentId: 't1',
      body: 'Between us, we can give',
      internal: true,
    });
    expect(server.refresh).toHaveBeenCalled();
  });

  it('keeps what was typed in the reply box while the reply was in flight', async () => {
    let finishReply!: (outcome: { ok: true }) => void;
    server.reply.mockReturnValue(
      new Promise((resolve) => {
        finishReply = resolve;
      }),
    );
    show({ side: 'buyer' });
    const open = thread('t1');

    type(field(open, 'Reply'), 'We can give');
    await click(button(open, 'Reply'));
    type(field(open, 'Reply'), 'Actually we cannot');
    await act(async () => finishReply({ ok: true }));

    expect((field(open, 'Reply') as HTMLTextAreaElement).value).toBe(
      'Actually we cannot',
    );
  });

  it('clears the reply box after a reply when it was left untouched', async () => {
    show({ side: 'buyer' });
    const open = thread('t1');

    type(field(open, 'Reply'), 'We can give');
    await click(button(open, 'Reply'));

    expect((field(open, 'Reply') as HTMLTextAreaElement).value).toBe('');
  });

  it('offers no internal toggle on a reply to an internal thread, which is internal already', () => {
    show({ side: 'buyer' }, [{ ...threads[0]!, internal: true }]);

    expect(field(thread('t1'), 'Internal (buyer side only)')).toBeNull();
  });

  it("offers Resolve and Reopen only on the viewer's own side's threads", async () => {
    show({ side: 'seller' });

    expect(button(thread('t1'), 'Resolve')).toBeNull();
    await click(button(thread('t2'), 'Reopen'));

    expect(server.reopen).toHaveBeenCalledWith({ commentId: 't2' });
    expect(server.refresh).toHaveBeenCalled();

    show({ side: 'buyer' });

    expect(button(thread('t2'), 'Reopen')).toBeNull();
    await click(button(thread('t1'), 'Resolve'));

    expect(server.resolve).toHaveBeenCalledWith({ commentId: 't1' });
  });

  it('says why when a comment is refused', async () => {
    server.add.mockResolvedValue({
      ok: false,
      refusal: 'This team is read-only until billing is updated.',
    });
    show({ side: 'buyer' });
    const form = newCommentForm();

    type(field(form, 'Comment'), 'While locked');
    await click(button(form, 'Post comment'));

    expect(form.querySelector('[role="alert"]')?.textContent).toBe(
      'This team is read-only until billing is updated.',
    );
    expect(server.refresh).not.toHaveBeenCalled();
  });

  it('shows a comment someone else posts on this version without a reload', async () => {
    show(null);

    await act(() =>
      realtime.insert('contract_comment', {
        contract_version_id: 'v1',
        body: 'Cap the indemnity',
      }),
    );

    expect(server.refresh).toHaveBeenCalled();
  });

  it('shows a comment resolved or reopened elsewhere without a reload', async () => {
    show(null);

    await act(() =>
      realtime.update('contract_comment', {
        contract_version_id: 'v1',
        body: 'Price needs to drop',
      }),
    );

    expect(server.refresh).toHaveBeenCalled();
  });

  it('stays put when a comment is posted on another version', async () => {
    show(null);

    await act(() =>
      realtime.insert('contract_comment', {
        contract_version_id: 'v2',
        body: 'Elsewhere',
      }),
    );

    expect(server.refresh).not.toHaveBeenCalled();
  });

  it('says why when resolving is refused', async () => {
    server.resolve.mockResolvedValue({
      ok: false,
      refusal: 'You cannot comment on this contract.',
    });
    show({ side: 'buyer' });

    await click(button(thread('t1'), 'Resolve'));

    expect(thread('t1').querySelector('[role="alert"]')?.textContent).toBe(
      'You cannot comment on this contract.',
    );
  });
});
