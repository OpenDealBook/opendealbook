// @vitest-environment jsdom
import { act } from 'react';

import { NextIntlClientProvider } from 'next-intl';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import messages from '../../../../../messages/en.json';
import type {
  AskedQuestion,
  FinishedQuestion,
} from '../../_components/deal-ask-panel';

const NOW = '2026-11-02T12:00:00.000Z';

const navigation = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));
const paging = vi.hoisted(() => ({ loadMore: vi.fn() }));
const workspace = vi.hoisted(() => ({
  permissions: ['deals.work'],
  aiConnected: true,
}));

function asked(
  id: string,
  threadId: string,
  question: string,
  createdAt: string,
): AskedQuestion {
  return {
    id,
    thread_id: threadId,
    asked_by: 'user-1',
    question,
    answer: `Answer to ${question}`,
    status: 'answered',
    citations: [],
    created_at: createdAt,
    finished_at: createdAt,
  };
}

const questionsByDeal: Record<string, AskedQuestion[]> = {
  acme: [
    asked('q-1', 't-revenue', 'What was revenue?', '2026-11-01T09:00:00Z'),
    asked('q-2', 't-staff', 'How many staff?', '2026-11-01T10:00:00Z'),
  ],
  birch: [
    asked('q-3', 't-lease', 'When does the lease end?', '2026-11-01T11:00:00Z'),
  ],
};

vi.mock('next/navigation', () => ({
  useRouter: () => navigation,
  notFound: () => {
    throw new Error('not found');
  },
}));

vi.mock('../layout', () => ({
  loadTeamWorkspace: async () => ({
    user: { id: 'user-1' },
    team: { id: 'team-1', slug: 'crew' },
    permissions: workspace.permissions,
  }),
}));

vi.mock('../deals/[id]/ask/actions', () => ({
  deleteDealAiQuestion: async () => true,
}));

const threadDeals: Record<string, string> = {
  't-lease': 'birch',
  't-staff': 'acme',
  't-revenue': 'acme',
  't-new': 'birch',
};

vi.mock('./actions', () => ({ loadMoreAiThreads: paging.loadMore }));

vi.mock('../../_lib/deal-ask-data', () => ({
  listAiThreads: async () => ({
    threads: [
      {
        id: 't-lease',
        dealId: 'birch',
        dealName: 'Birch Bakery',
        question: 'When does the lease end?',
        lastAskedAt: '2026-11-01T11:00:00Z',
      },
      {
        id: 't-staff',
        dealId: 'acme',
        dealName: 'Acme Plumbing',
        question: 'How many staff?',
        lastAskedAt: '2026-11-01T10:00:00Z',
      },
    ],
    next: { id: 't-staff', lastAskedAt: '2026-11-01T10:00:00Z' },
  }),
  aiThreadDeal: async (threadId: string) => threadDeals[threadId] ?? null,
  dealName: async (dealId: string) =>
    ({ acme: 'Acme Plumbing', birch: 'Birch Bakery', cedar: 'Cedar Cabinets' })[
      dealId
    ],
  teamAiConnected: async () => workspace.aiConnected,
  listAskableDeals: async () => [
    { id: 'acme', name: 'Acme Plumbing' },
    { id: 'birch', name: 'Birch Bakery' },
  ],
  loadDealAsk: async (dealId: string) =>
    ['acme', 'birch', 'cedar'].includes(dealId)
      ? {
          people: { 'user-1': 'Pat Buyer' },
          questions: questionsByDeal[dealId] ?? [],
          readable: {},
          connected: true,
          readOnly: false,
          canManage: false,
        }
      : null,
}));

import TeamAiPage from './page';

let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;

async function render(searchParams: Record<string, string> = {}) {
  const page = await TeamAiPage({
    params: Promise.resolve({ locale: 'en', account: 'crew' }),
    searchParams: Promise.resolve(searchParams),
  });
  await act(async () => {
    root.render(
      <NextIntlClientProvider
        locale={'en'}
        messages={messages}
        timeZone={'UTC'}
        now={new Date(NOW)}
      >
        {page}
      </NextIntlClientProvider>,
    );
  });
}

function threadLinks() {
  return [...container.querySelectorAll('nav a')];
}

function conversation() {
  return [...container.querySelectorAll('[data-question]')].map(
    (question) => question.textContent,
  );
}

function summary(id: string, question: string) {
  return {
    id,
    dealId: 'acme',
    dealName: 'Acme Plumbing',
    question,
    lastAskedAt: '2026-11-01T09:00:00Z',
  };
}

function button(name: string) {
  return [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent === name,
  );
}

function sse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function streamed() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(started) {
      controller = started;
    },
  });
  const encoder = new TextEncoder();

  return {
    response: new Response(body, {
      headers: { 'content-type': 'text/event-stream' },
    }),
    async send(text: string) {
      await act(async () => {
        controller.enqueue(encoder.encode(text));
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    },
    async close() {
      await act(async () => {
        controller.close();
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    },
  };
}

async function ask(question: string) {
  const field = container.querySelector('textarea')!;
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    'value',
  )!.set!;
  await act(async () => {
    setter.call(field, question);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => {
    field.closest('form')!.requestSubmit();
  });
  return JSON.parse(fetchMock.mock.calls[0]![1].body as string) as Record<
    string,
    unknown
  >;
}

beforeEach(() => {
  workspace.permissions = ['deals.work'];
  workspace.aiConnected = true;
  navigation.push.mockReset();
  navigation.replace.mockReset();
  paging.loadMore.mockReset();
  fetchMock = vi.fn(async () =>
    Response.json({ code: 'already_running' }, { status: 409 }),
  );
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('TeamAiPage', () => {
  it('lists every thread across deals in the order given, each with its deal name and first question', async () => {
    await render();

    expect(
      threadLinks().map((link) => [
        link.querySelector('[data-deal]')!.textContent,
        link.querySelector('[data-first-question]')!.textContent,
        link.getAttribute('href'),
      ]),
    ).toEqual([
      [
        'Birch Bakery',
        'When does the lease end?',
        '/home/crew/ai?thread=t-lease',
      ],
      ['Acme Plumbing', 'How many staff?', '/home/crew/ai?thread=t-staff'],
    ]);
  });

  it('loads the next page of threads after the last one shown', async () => {
    paging.loadMore.mockResolvedValue({
      threads: [
        {
          id: 't-revenue',
          dealId: 'acme',
          dealName: 'Acme Plumbing',
          question: 'What was revenue?',
          lastAskedAt: '2026-11-01T09:00:00Z',
        },
      ],
      next: null,
    });
    await render();

    await act(async () => {
      button(messages.aiHome.loadMore)!.click();
    });

    expect(paging.loadMore).toHaveBeenCalledWith({
      teamId: 'team-1',
      after: { id: 't-staff', lastAskedAt: '2026-11-01T10:00:00Z' },
    });
    expect(threadLinks().map((link) => link.getAttribute('href'))).toEqual([
      '/home/crew/ai?thread=t-lease',
      '/home/crew/ai?thread=t-staff',
      '/home/crew/ai?thread=t-revenue',
    ]);
    expect(button(messages.aiHome.loadMore)).toBeUndefined();
  });

  it('loads each page once while a load is in flight, and never lists a thread twice', async () => {
    let finish!: (page: unknown) => void;
    paging.loadMore.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    paging.loadMore.mockResolvedValueOnce({
      threads: [
        summary('t-revenue', 'What was revenue?'),
        summary('t-margin', 'What are margins?'),
      ],
      next: null,
    });
    await render();

    await act(async () => {
      button(messages.aiHome.loadMore)!.click();
    });
    await act(async () => {
      button(messages.aiHome.loadMore)!.click();
    });
    expect(paging.loadMore).toHaveBeenCalledTimes(1);

    await act(async () => {
      finish({
        threads: [
          summary('t-staff', 'How many staff?'),
          summary('t-revenue', 'What was revenue?'),
        ],
        next: { id: 't-revenue', lastAskedAt: '2026-11-01T09:00:00Z' },
      });
    });
    await act(async () => {
      button(messages.aiHome.loadMore)!.click();
    });

    expect(threadLinks().map((link) => link.getAttribute('href'))).toEqual([
      '/home/crew/ai?thread=t-lease',
      '/home/crew/ai?thread=t-staff',
      '/home/crew/ai?thread=t-revenue',
      '/home/crew/ai?thread=t-margin',
    ]);
  });

  it('falls back to the newest thread when the chosen thread is not a thread id', async () => {
    await render({ thread: 'not-a-uuid' });

    expect(conversation()).toEqual([
      expect.stringContaining('When does the lease end?'),
    ]);
  });

  it('falls back to the newest thread when the chosen deal cannot be opened', async () => {
    await render({ deal: 'forbidden-deal' });

    expect(conversation()).toEqual([
      expect.stringContaining('When does the lease end?'),
    ]);
  });

  it('says when more threads could not be loaded, and lets the user retry', async () => {
    paging.loadMore.mockRejectedValueOnce(new Error('offline'));
    paging.loadMore.mockResolvedValueOnce({
      threads: [summary('t-revenue', 'What was revenue?')],
      next: null,
    });
    await render();

    await act(async () => {
      button(messages.aiHome.loadMore)!.click();
    });
    expect(container.querySelector('[role=alert]')!.textContent).toBe(
      messages.aiHome.loadFailed,
    );
    expect(button(messages.aiHome.loadMore)!.disabled).toBe(false);

    await act(async () => {
      button(messages.aiHome.loadMore)!.click();
    });
    expect(container.querySelector('[role=alert]')).toBeNull();
    expect(threadLinks().at(-1)!.getAttribute('href')).toBe(
      '/home/crew/ai?thread=t-revenue',
    );
  });

  it("heads the panel with the open deal's name, linked to the deal, even when no listed thread names it", async () => {
    await render({ deal: 'cedar' });

    const heading = container.querySelector('[data-open-deal] a')!;
    expect(heading.textContent).toBe('Cedar Cabinets');
    expect(heading.getAttribute('href')).toBe('/home/crew/deals/cedar');
  });

  it('opens the newest thread when none is chosen', async () => {
    await render();

    expect(conversation()).toEqual([
      expect.stringContaining('When does the lease end?'),
    ]);
  });

  it("opens a selected thread in the panel for that thread's deal and continues it there", async () => {
    await render({ thread: 't-lease' });

    expect(conversation()).toEqual([
      expect.stringContaining('When does the lease end?'),
    ]);
    expect(
      container
        .querySelector('nav a[aria-current="page"]')!
        .getAttribute('href'),
    ).toBe('/home/crew/ai?thread=t-lease');
    expect(await ask('Is it renewable?')).toMatchObject({
      dealId: 'birch',
      threadId: 't-lease',
      question: 'Is it renewable?',
    });
  });

  it('opens an older thread of a deal, not its newest, and switches when another thread is picked', async () => {
    await render({ thread: 't-revenue' });
    expect(conversation()).toEqual([
      expect.stringContaining('What was revenue?'),
    ]);

    await render({ thread: 't-staff' });
    expect(conversation()).toEqual([
      expect.stringContaining('How many staff?'),
    ]);
  });

  it('asks a new question in a fresh thread on the deal picked from the dropdown', async () => {
    await render();

    await act(async () => {
      container
        .querySelector('[role=combobox]')!
        .dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
        );
    });
    const birch = [...document.querySelectorAll('[role=option]')].find(
      (option) => option.textContent === 'Birch Bakery',
    )!;
    await act(async () => {
      birch.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      );
    });
    expect(navigation.push).toHaveBeenCalledWith('/home/crew/ai?deal=birch');

    await render({ deal: 'birch' });
    expect(conversation()).toEqual([]);
    const body = await ask('What is the asking price?');
    expect(body).toMatchObject({ dealId: 'birch' });
    expect(body).not.toHaveProperty('threadId');
  });

  it('offers no deal picker to someone who cannot work on deals', async () => {
    workspace.permissions = [];
    await render();

    expect(container.querySelector('[role=combobox]')).toBeNull();
  });

  it('greys out the deal picker and points to settings when the team has no AI provider', async () => {
    workspace.aiConnected = false;
    await render();

    expect(
      container.querySelector('[role=combobox]')!.hasAttribute('disabled'),
    ).toBe(true);
    expect(
      [...container.querySelectorAll('a')]
        .find((link) => link.textContent === messages.aiHome.connectAction)!
        .getAttribute('href'),
    ).toBe('/home/crew/settings');
  });

  it('starts a new question on the open deal from its own control', async () => {
    await render({ thread: 't-lease' });

    const newQuestion = [...container.querySelectorAll('a')].find(
      (link) => link.textContent === messages.aiHome.newThread,
    )!;
    expect(newQuestion.getAttribute('href')).toBe('/home/crew/ai?deal=birch');

    await render({ deal: 'birch' });
    expect(conversation()).toEqual([]);
  });

  it('follows the thread a new answer lands in, in the URL, without losing the answer', async () => {
    const stream = streamed();
    fetchMock.mockResolvedValueOnce(stream.response);
    await render({ deal: 'birch' });

    await ask('Is the lease assignable?');
    await stream.send(sse('progress', { kind: 'working' }));
    expect(navigation.replace).not.toHaveBeenCalled();
    await stream.send(
      sse('done', {
        id: 'q-new',
        thread_id: 't-new',
        question: 'Is the lease assignable?',
        answer: 'Yes, with consent.',
        status: 'answered',
        citations: [],
        created_at: NOW,
        finished_at: NOW,
        credits_used: 1,
      } satisfies FinishedQuestion),
    );
    expect(navigation.replace).toHaveBeenCalledWith(
      '/home/crew/ai?thread=t-new',
    );

    await render({ thread: 't-new' });
    expect(conversation()).toEqual([
      expect.stringContaining('Yes, with consent.'),
    ]);
    await stream.close();
  });

  it('moves the URL to a new question on the deal when the open thread is deleted', async () => {
    await render({ thread: 't-lease' });

    await act(async () => {
      button(messages.dealAsk.delete)!.click();
    });

    expect(navigation.replace).toHaveBeenCalledWith('/home/crew/ai?deal=birch');
  });
});
