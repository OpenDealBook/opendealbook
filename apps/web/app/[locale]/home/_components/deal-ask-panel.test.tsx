// @vitest-environment jsdom
import { act } from 'react';

import { NextIntlClientProvider } from 'next-intl';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import messages from '../../../../messages/en.json';
import {
  type AskedQuestion,
  DealAskPanel,
  type FinishedQuestion,
} from './deal-ask-panel';

const navigation = vi.hoisted(() => ({ refresh: vi.fn() }));
const server = vi.hoisted(() => ({ deleteQuestion: vi.fn() }));

vi.mock('next/navigation', () => ({
  useParams: () => ({ account: 'acme', id: 'deal-1' }),
  useRouter: () => ({ refresh: navigation.refresh }),
}));

vi.mock('../[account]/deals/[id]/ask/actions', () => ({
  deleteDealAiQuestion: server.deleteQuestion,
}));

vi.mock('@odb/lender-rooms/faq/publish.ts', () => ({
  saveNewFaqEntry: vi.fn(),
}));

const PROMOTE = 'Add to lender FAQ';

const NOW = Date.parse('2026-11-02T12:00:00Z');
const VIEWER = 'user-viewer';
const PEOPLE = { [VIEWER]: 'Pat Buyer', 'user-other': 'Sam Partner' };

function asked(overrides: Partial<AskedQuestion>): AskedQuestion {
  return {
    id: 'q-1',
    thread_id: 'thread-1',
    asked_by: VIEWER,
    question: 'What was revenue?',
    answer: 'Revenue was $2M.',
    status: 'answered',
    citations: [],
    created_at: new Date(NOW - 60_000).toISOString(),
    finished_at: new Date(NOW - 30_000).toISOString(),
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;

function render(props: Partial<Parameters<typeof DealAskPanel>[0]> = {}): void {
  act(() =>
    root.render(
      <NextIntlClientProvider
        locale={'en'}
        messages={{
          ...messages,
          dealAsk: { ...messages.dealAsk, promote: { open: PROMOTE } },
        }}
        timeZone={'UTC'}
      >
        <DealAskPanel
          dealId={'deal-1'}
          viewerId={VIEWER}
          people={PEOPLE}
          now={NOW}
          questions={[]}
          readable={{}}
          connected
          readOnly={false}
          canManage={false}
          settingsHref={'/home/acme/settings'}
          {...props}
        />
      </NextIntlClientProvider>,
    ),
  );
}

function button(name: string) {
  return [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent === name,
  );
}

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

function finished(overrides: Partial<FinishedQuestion> = {}): FinishedQuestion {
  return {
    id: 'q-2',
    thread_id: 'thread-1',
    question: 'And margins?',
    answer: 'Margins are 20% [cim.pdf v2, p. 4].',
    status: 'answered',
    citations: [
      {
        documentId: 'doc-cim',
        documentName: 'cim.pdf',
        version: 2,
        pageFrom: 4,
        pageTo: 4,
      },
    ],
    credits_used: 1.5,
    created_at: new Date(NOW).toISOString(),
    finished_at: new Date(NOW).toISOString(),
    ...overrides,
  };
}

function textarea() {
  return container.querySelector('textarea')!;
}

function alert() {
  return container.querySelector('[role="alert"]')?.textContent ?? null;
}

async function ask(question: string, response: Response) {
  const fetch = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetch);
  type(question);
  await act(async () => {
    button('Ask')!.click();
  });
  return fetch;
}

beforeEach(() => {
  navigation.refresh.mockReset();
  server.deleteQuestion.mockReset();
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
  vi.unstubAllGlobals();
});

describe('DealAskPanel', () => {
  it('asks for an AI provider with a link to its settings instead of the form', () => {
    render({ connected: false, questions: [asked({})] });

    expect(container.querySelector('textarea')).toBeNull();
    expect(container.textContent).toContain('Connect AI');
    expect(
      container.querySelector('a[href="/home/acme/settings"]')?.textContent,
    ).toBe('Open AI provider settings');
    expect(container.textContent).toContain('Revenue was $2M.');
  });

  it('disables the form with the read-only message when the team is read-only', () => {
    render({ readOnly: true });

    expect(container.querySelector('textarea')!.disabled).toBe(true);
    expect(container.textContent).toContain(
      'This team is read-only until billing is updated.',
    );
  });

  it('names who asked each question and when', () => {
    render({
      questions: [
        asked({ id: 'q-1', created_at: '2026-11-02T09:30:00Z' }),
        asked({
          id: 'q-2',
          asked_by: 'user-other',
          created_at: '2026-11-02T10:15:00Z',
        }),
        asked({
          id: 'q-3',
          asked_by: null,
          created_at: '2026-11-02T11:00:00Z',
        }),
      ],
    });

    expect(
      [...container.querySelectorAll('[data-asked-by]')].map(
        (line) => line.textContent,
      ),
    ).toEqual([
      'Pat Buyer asked Nov 2, 2026, 9:30 AM',
      'Sam Partner asked Nov 2, 2026, 10:15 AM',
      'A former member asked Nov 2, 2026, 11:00 AM',
    ]);
  });

  it('blocks a question over 4,000 characters', () => {
    render();

    type('a'.repeat(4001));
    expect(button('Ask')!.disabled).toBe(true);
    expect(container.textContent).toContain(
      'A question can be at most 4,000 characters.',
    );

    type('a'.repeat(4000));
    expect(button('Ask')!.disabled).toBe(false);
    expect(container.textContent).not.toContain('at most 4,000 characters');
  });

  it('closes a thread holding 20 questions and offers a new one', () => {
    render({
      questions: Array.from({ length: 20 }, (_, index) =>
        asked({ id: `q-${index}` }),
      ),
    });

    expect(textarea().disabled).toBe(true);
    expect(container.textContent).toContain('Thread full, start a new one');

    act(() => button('New thread')!.click());

    expect(textarea().disabled).toBe(false);
    expect(container.textContent).not.toContain('Thread full');
  });

  it('shows a question running for over 10 minutes as failed and lets its asker delete it', () => {
    render({
      questions: [
        asked({
          status: 'running',
          answer: null,
          finished_at: null,
          created_at: new Date(NOW - 11 * 60_000).toISOString(),
        }),
      ],
    });

    expect(container.textContent).toContain(
      'This question stopped before it finished.',
    );
    expect(container.textContent).not.toContain('Still working');
    expect(button('Delete')).toBeDefined();
  });

  it('offers a deal manager to promote only answered questions to the lender FAQ', () => {
    render({
      canManage: true,
      questions: [
        asked({ id: 'q-1', asked_by: 'user-other' }),
        asked({ id: 'q-2', status: 'failed', answer: 'No sources.' }),
        asked({ id: 'q-3', status: 'credits_ran_out', answer: null }),
        asked({
          id: 'q-4',
          status: 'running',
          answer: null,
          finished_at: null,
          created_at: new Date(NOW - 60_000).toISOString(),
        }),
      ],
    });

    expect(
      [...container.querySelectorAll('[data-question]')].map((question) =>
        [...question.querySelectorAll('button')].some(
          (candidate) => candidate.textContent === PROMOTE,
        ),
      ),
    ).toEqual([true, false, false, false]);
  });

  it('does not offer promotion to someone who cannot manage the deal', () => {
    render({ questions: [asked({})] });

    expect(button(PROMOTE)).toBeUndefined();
  });

  it('hides promotion from a deal manager while the team is read-only', () => {
    render({ canManage: true, readOnly: true, questions: [asked({})] });

    expect(button(PROMOTE)).toBeUndefined();
  });

  it('opens the given thread first instead of the newest', () => {
    render({
      initialThreadId: 'thread-old',
      questions: [
        asked({
          id: 'q-old',
          thread_id: 'thread-old',
          question: 'Old question?',
          created_at: new Date(NOW - 120_000).toISOString(),
        }),
        asked({ id: 'q-new', thread_id: 'thread-new', question: 'New one?' }),
      ],
    });

    expect(container.querySelector('[data-question]')?.textContent).toContain(
      'Old question?',
    );
  });

  it('hides its own thread list when asked to', () => {
    render({ showThreadList: false, questions: [asked({})] });

    expect(container.textContent).not.toContain('Team questions');
    expect(button('New thread')).toBeUndefined();
    expect(container.querySelector('[data-question]')?.textContent).toContain(
      'What was revenue?',
    );
  });

  it('reports each change of the open thread', async () => {
    const onThreadChange = vi.fn();
    server.deleteQuestion.mockResolvedValue(true);
    render({
      onThreadChange,
      questions: [
        asked({ id: 'q-1', thread_id: 'thread-1', question: 'First?' }),
        asked({
          id: 'q-2',
          thread_id: 'thread-2',
          question: 'Second?',
          created_at: new Date(NOW - 120_000).toISOString(),
        }),
      ],
    });

    act(() => button('Second?Nov 2, 2026')!.click());
    act(() => button('New thread')!.click());
    const stream = streamed();
    await ask('Who are the owners?', stream.response);
    await stream.send(
      sse('done', finished({ id: 'q-3', thread_id: 'thread-3' })),
    );
    await stream.close();
    await act(async () => {
      [...container.querySelectorAll('[data-question]')]
        .find((question) => question.textContent?.includes('And margins?'))!
        .querySelector('button')!
        .click();
    });

    expect(onThreadChange.mock.calls).toEqual([
      ['thread-2'],
      [null],
      ['thread-3'],
      [null],
    ]);
  });

  it('shows the out-of-credits message and a failed question with its reason', () => {
    render({
      questions: [
        asked({ id: 'q-1', status: 'credits_ran_out', answer: null }),
        asked({
          id: 'q-2',
          status: 'failed',
          answer: 'Too many tool calls in one turn; ask again',
        }),
      ],
    });

    expect(container.textContent).toContain(
      'Not enough AI credits left this month',
    );
    expect(container.textContent).toContain(
      'Too many tool calls in one turn; ask again',
    );
  });

  it.each([
    ['their own finished question', asked({}), true],
    [
      'their own question still running',
      asked({ status: 'running', answer: null, finished_at: null }),
      false,
    ],
    [
      "a teammate's finished question",
      asked({ asked_by: 'user-other' }),
      false,
    ],
  ])('offers delete to the viewer on %s', (_, question, shown) => {
    render({ questions: [question] });

    expect(button('Delete') !== undefined).toBe(shown);
  });

  it('removes a deleted question from the thread', async () => {
    server.deleteQuestion.mockResolvedValue(true);
    render({
      questions: [
        asked({ id: 'q-1', question: 'What was revenue?' }),
        asked({ id: 'q-2', question: 'And margins?' }),
      ],
    });

    await act(async () => {
      container.querySelectorAll('button').forEach((candidate) => {
        if (
          candidate.textContent === 'Delete' &&
          candidate.closest('[data-question]')?.textContent?.includes('margins')
        ) {
          candidate.click();
        }
      });
    });

    expect(container.textContent).not.toContain('And margins?');
    expect(container.textContent).toContain('What was revenue?');
  });

  it('falls back to a new thread when its last question is deleted', async () => {
    server.deleteQuestion.mockResolvedValue(true);
    render({ questions: [asked({})] });

    await act(async () => {
      button('Delete')!.click();
    });
    const fetch = await ask('Who are the owners?', streamed().response);

    expect(container.textContent).toContain('No questions yet');
    expect(
      JSON.parse(fetch.mock.calls[0]![1].body as string),
    ).not.toHaveProperty('threadId');
  });

  it.each([
    [
      'refuses to delete it',
      () => server.deleteQuestion.mockResolvedValue(false),
    ],
    [
      'fails',
      () =>
        server.deleteQuestion.mockRejectedValue(
          new Error('This team is read-only until billing is updated.'),
        ),
    ],
  ])('keeps the question and says so when the server %s', async (_, reply) => {
    reply();
    render({ questions: [asked({})] });

    await act(async () => {
      button('Delete')!.click();
    });

    expect(container.textContent).toContain('What was revenue?');
    expect(alert()).toBe('This question could not be deleted.');
  });

  it.each([
    [
      { kind: 'search', query: 'revenue' },
      'Searching the documents for "revenue"',
    ],
    [
      { kind: 'search_past_answers', query: 'revenue' },
      'Searching earlier answers for "revenue"',
    ],
    [{ kind: 'read_pages', from: 4, to: 5 }, 'Reading pages 4 to 5'],
    [{ kind: 'read_pages', from: 4, to: 4 }, 'Reading page 4'],
    [
      { kind: 'read_sheet', sheet: 'P&L', range: 'A1:C9' },
      'Reading P&L, A1:C9',
    ],
    [{ kind: 'list_documents' }, 'Looking through the document list'],
    [{ kind: 'list_sheets' }, 'Looking through the sheets'],
    [{ kind: 'working' }, 'Working on the answer'],
  ])('words the %o progress as %s', async (progress, wording) => {
    render();
    const stream = streamed();
    await ask('What was revenue?', stream.response);

    await stream.send(sse('progress', progress));

    expect(container.textContent).toContain(wording);
  });

  it('skips a stream block without an event line', async () => {
    render();
    const stream = streamed();
    await ask('What was revenue?', stream.response);

    await stream.send(
      ': keep-alive\n\n' + sse('progress', { kind: 'working' }),
    );

    expect(container.textContent).toContain('Working on the answer');
    expect(alert()).toBeNull();
  });

  it('streams a follow-up into the selected thread and shows the saved answer when done', async () => {
    render({ questions: [asked({ id: 'q-1', thread_id: 'thread-1' })] });
    const stream = streamed();
    const fetch = await ask('And margins?', stream.response);
    const done = sse('done', finished());

    await stream.send(sse('progress', { kind: 'working' }) + done.slice(0, 20));
    expect(container.textContent).toContain('Working on the answer');

    await stream.send(done.slice(20));
    await stream.close();

    expect(JSON.parse(fetch.mock.calls[0]![1].body as string)).toMatchObject({
      threadId: 'thread-1',
    });
    expect(container.textContent).not.toContain('Working on the answer');
    expect(container.textContent).toContain(
      'Margins are 20% cim.pdf, unavailable.',
    );
  });

  it('keeps a running question in its own thread while another is open', async () => {
    render({
      questions: [
        asked({ id: 'q-1', thread_id: 'thread-1', question: 'Thread one?' }),
        asked({
          id: 'q-0',
          thread_id: 'thread-0',
          question: 'Thread zero?',
          created_at: new Date(NOW - 120_000).toISOString(),
        }),
      ],
    });
    const stream = streamed();
    await ask('Follow-up in one?', stream.response);
    await stream.send(sse('progress', { kind: 'working' }));

    act(() => button('Thread zero?Nov 2, 2026')!.click());
    expect(container.textContent).not.toContain('Follow-up in one?');

    await stream.send(sse('done', finished({ question: 'Follow-up in one?' })));
    await stream.close();
    expect(container.textContent).toContain('Thread zero?');
    expect(container.textContent).not.toContain('Margins are 20%');

    act(() => button('Thread one?Nov 2, 2026')!.click());
    expect(container.textContent).toContain('Follow-up in one?');
    expect(container.textContent).toContain('Margins are 20%');
  });

  it('starts a new thread when asked from a new thread', async () => {
    render({ questions: [asked({})] });
    act(() => button('New thread')!.click());
    const fetch = await ask('Who are the owners?', streamed().response);

    expect(
      JSON.parse(fetch.mock.calls[0]![1].body as string),
    ).not.toHaveProperty('threadId');
  });

  it('shows the error event when the answer could not be saved', async () => {
    render();
    const stream = streamed();
    await ask('What was revenue?', stream.response);

    await stream.send(
      sse('error', { error: 'Stored text may change', code: 'save_failed' }),
    );
    await stream.close();

    expect(alert()).toBe(
      'The answer was lost before it could be saved. Check the history shortly.',
    );
  });

  it.each([
    ['unauthenticated', 'Your session ended. Sign in again.'],
    [
      'already_running',
      'You already have a question running. Wait for it to finish.',
    ],
    ['thread_full', 'Thread full, start a new one'],
    ['connect_ai_provider', 'Connect an AI provider first.'],
    ['team_read_only', 'This team is read-only until billing is updated.'],
    ['not_deal_team', 'Only the deal team can ask about this deal.'],
    ['deal_not_found', 'This deal no longer exists.'],
    ['thread_not_found', 'This thread no longer exists. Start a new one.'],
    ['empty_question', 'Type a question first.'],
    ['question_too_long', 'A question can be at most 4,000 characters.'],
    ['unknown_locale', 'Something went wrong asking that question. Try again.'],
    [
      'invalid_request',
      'Something went wrong asking that question. Try again.',
    ],
    ['rate_limited', 'Something went wrong asking that question. Try again.'],
  ])(
    'words the server refusal %s from the translations',
    async (code, wording) => {
      render();
      await ask(
        'What was revenue?',
        Response.json(
          { error: 'English text the panel must ignore', code },
          { status: 409 },
        ),
      );

      expect(alert()).toBe(wording);
      expect(textarea().value).toBe('What was revenue?');
      expect(button('Ask')!.disabled).toBe(false);
    },
  );

  it.each([
    [
      'the connection drops',
      () => Promise.reject(new TypeError('Failed to fetch')),
    ],
    [
      'the error body is not JSON',
      () =>
        Promise.resolve(
          new Response('<html>Bad gateway</html>', { status: 502 }),
        ),
    ],
  ])(
    'says the connection was lost and reloads the history when %s',
    async (_, reply) => {
      render();
      const fetch = vi.fn().mockImplementation(reply);
      vi.stubGlobal('fetch', fetch);
      type('What was revenue?');
      await act(async () => {
        button('Ask')!.click();
      });

      expect(alert()).toBe('Connection lost; check history shortly');
      expect(navigation.refresh).toHaveBeenCalled();
      expect(button('Ask')!.disabled).toBe(false);
    },
  );

  it('refetches the history when the stream ends without a done event', async () => {
    render();
    const stream = streamed();
    await ask('What was revenue?', stream.response);

    await stream.close();

    expect(navigation.refresh).toHaveBeenCalled();
  });
});
