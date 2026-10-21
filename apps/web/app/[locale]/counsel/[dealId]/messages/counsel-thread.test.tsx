// @vitest-environment jsdom
import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeRealtime } from '../../../home/_components/fake-realtime';

const server = vi.hoisted(() => ({ post: vi.fn(), refresh: vi.fn() }));
const realtime = fakeRealtime();

vi.mock('@odb/supabase/hooks', () => ({
  useSupabase: () => realtime.client,
}));

vi.mock('@odb/deal-counsel/thread.ts', () => ({
  postCounselMessage: server.post,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: server.refresh }),
  usePathname: () => '/counsel/deal-1/messages',
}));

import { CounselThread } from './counsel-thread';

let container: HTMLDivElement;
let root: Root;

const messages = [
  {
    id: 'm1',
    author_name: 'Olive Owner',
    from_team: true,
    body: 'Draft APA is up',
    created_at: '2026-10-15T14:00:00Z',
  },
  {
    id: 'm2',
    author_name: 'Bea Buyerlaw',
    from_team: false,
    body: 'Redline attached',
    created_at: '2026-10-15T15:00:00Z',
  },
];

function type(value: string) {
  const field = container.querySelector('textarea')!;
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    'value',
  )!.set!;

  act(() => {
    setter.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function sendButton() {
  return [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent === 'Send',
  )!;
}

async function render(thread = messages) {
  await act(async () => {
    root.render(
      <CounselThread
        dealId={'deal-1'}
        side={'buyer'}
        title={"Buyer's counsel"}
        messages={thread}
        audience={{
          kind: 'counsel',
          teamName: 'Harbor Holdings',
          sellerName: null,
        }}
      />,
    );
  });
}

beforeEach(() => {
  server.post.mockReset();
  server.refresh.mockReset();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('CounselThread', () => {
  it('lists messages oldest first, marking the ones the deal team wrote', async () => {
    await render();

    const items = [...container.querySelectorAll('li')].map(
      (item) => item.textContent,
    );

    expect(items).toHaveLength(2);
    expect(items[0]).toContain('Olive Owner');
    expect(items[0]).toContain('Deal team');
    expect(items[0]).toContain('Draft APA is up');
    expect(items[1]).toContain('Bea Buyerlaw');
    expect(items[1]).not.toContain('Deal team');
    expect(items[1]).toContain('Redline attached');
  });

  it('says so when nobody has written yet', async () => {
    await render([]);

    expect(container.textContent).toContain('No messages yet.');
  });

  it('sends a message into its side and refreshes the thread', async () => {
    server.post.mockResolvedValueOnce({ ok: true, value: undefined });
    await render();
    type('Please review clause 4');

    await act(async () => {
      sendButton().click();
    });

    expect(server.post).toHaveBeenCalledWith({
      dealId: 'deal-1',
      side: 'buyer',
      body: 'Please review clause 4',
    });
    expect(container.querySelector('textarea')!.value).toBe('');
    expect(server.refresh).toHaveBeenCalled();
  });

  it('keeps the message and says why when it is refused', async () => {
    server.post.mockResolvedValueOnce({
      ok: false,
      refusal: 'You cannot message on this deal.',
    });
    await render();
    type('Hello');

    await act(async () => {
      sendButton().click();
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      'You cannot message on this deal.',
    );
    expect(container.querySelector('textarea')!.value).toBe('Hello');
  });

  it('shows a read-only thread with the reason instead of a Send box', async () => {
    await act(async () => {
      root.render(
        <CounselThread
          dealId={'deal-1'}
          side={'buyer'}
          title={"Buyer's counsel"}
          messages={messages}
          audience={{ kind: 'team', sellerName: null }}
          readOnlyReason={'Only deal managers can message counsel.'}
        />,
      );
    });

    expect(container.textContent).toContain('Draft APA is up');
    expect(container.textContent).toContain(
      'Only deal managers can message counsel.',
    );
    expect(container.querySelector('textarea')).toBeNull();
    expect(container.querySelector('button')).toBeNull();
  });

  it("tells counsel the buyer's deal team reads it and is emailed, and the seller cannot see it", async () => {
    await render();

    expect(container.textContent).toContain(
      "Visible to the buyer's deal team at Harbor Holdings. They get an email. The seller cannot see this.",
    );
  });

  it("names the one seller who cannot see it", async () => {
    await act(async () => {
      root.render(
        <CounselThread
          dealId={'deal-1'}
          side={'seller'}
          title={"Seller's counsel"}
          messages={messages}
          audience={{ kind: 'team', sellerName: 'Walt Brennan' }}
        />,
      );
    });

    expect(container.textContent).toContain(
      "Visible to your deal team and the seller's counsel. The seller's counsel get an email. Walt Brennan (the seller) cannot see this.",
    );
  });

  it('shows a message the other side posts on this deal without a reload', async () => {
    await render();

    await act(() =>
      realtime.insert('counsel_message', {
        deal_id: 'deal-1',
        body: 'Redline v2',
      }),
    );

    expect(server.refresh).toHaveBeenCalled();
  });

  it('stays put when a message is posted on another deal', async () => {
    await render();

    await act(() =>
      realtime.insert('counsel_message', {
        deal_id: 'deal-2',
        body: 'Elsewhere',
      }),
    );

    expect(server.refresh).not.toHaveBeenCalled();
  });

  it('cannot send an empty message', async () => {
    await render();

    expect(sendButton().disabled).toBe(true);
  });
});
