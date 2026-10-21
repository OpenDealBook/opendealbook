// @vitest-environment jsdom
import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const server = vi.hoisted(() => ({
  create: vi.fn(),
  toggle: vi.fn(),
  remove: vi.fn(),
  assign: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('@odb/deals/server', () => ({
  createTodo: server.create,
  toggleTodo: server.toggle,
  deleteTodo: server.remove,
  assignTodo: server.assign,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: server.refresh }),
}));

import { DealTodos } from './deal-todos';

type Todo = {
  id: string;
  title: string;
  done: boolean;
  due_at: string | null;
  user_id?: string;
};

const members = [
  { userId: 'u-morgan', name: 'Morgan Reyes' },
  { userId: 'u-priya', name: 'Priya Shah' },
];

let container: HTMLDivElement;
let root: Root;

async function render(todos: Todo[]) {
  await act(async () => {
    root.render(
      <DealTodos
        accountId={'a-1'}
        dealId={'d-1'}
        currentUserId={'u-morgan'}
        members={members}
        todos={todos.map((todo) => ({ user_id: 'u-morgan', ...todo }))}
      />,
    );
  });
}

function setValue(input: HTMLInputElement | HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(input),
    'value',
  )!.set!;

  setter.call(input, value);
  input.dispatchEvent(
    new Event(input instanceof HTMLSelectElement ? 'change' : 'input', {
      bubbles: true,
    }),
  );
}

async function add(title: string) {
  await act(async () => {
    setValue(container.querySelector('input[placeholder="Add a to-do"]')!, title);
  });
  await act(async () => {
    [...container.querySelectorAll('button')]
      .find((button) => button.textContent === 'Add')!
      .click();
  });
}

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  server.create.mockResolvedValue({ ok: true, value: {} });
  server.assign.mockResolvedValue({ ok: true, value: undefined });
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-18T12:00:00Z'));
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe('DealTodos due dates', () => {
  it('shows the due date as a long date', async () => {
    await render([
      {
        id: 't-1',
        title: 'Send NDA',
        done: false,
        due_at: '2026-10-30T00:00:00Z',
      },
    ]);

    expect(container.textContent).toContain('Due October 30, 2026');
    expect(container.querySelector('.text-destructive')).toBeNull();
  });

  it('shows an open to-do past its due date in red and announces Overdue', async () => {
    await render([
      {
        id: 't-1',
        title: 'Send NDA',
        done: false,
        due_at: '2026-10-01T00:00:00Z',
      },
    ]);

    expect(container.querySelector('.text-destructive')?.textContent).toContain(
      'Overdue',
    );
  });

  it('does not show a done to-do past its due date in red', async () => {
    await render([
      {
        id: 't-1',
        title: 'Send NDA',
        done: true,
        due_at: '2026-10-01T00:00:00Z',
      },
    ]);

    expect(container.querySelector('.text-destructive')).toBeNull();
    expect(container.textContent).not.toContain('Overdue');
  });

  it('creates a to-do with the chosen due date', async () => {
    await render([]);

    await act(async () => {
      setValue(
        container.querySelector('input[placeholder="Add a to-do"]')!,
        'Send NDA',
      );
      setValue(container.querySelector('input[type="date"]')!, '2026-10-30');
    });
    await act(async () => {
      [...container.querySelectorAll('button')]
        .find((button) => button.textContent === 'Add')!
        .click();
    });

    expect(server.create).toHaveBeenCalledWith({
      account_id: 'a-1',
      deal_id: 'd-1',
      title: 'Send NDA',
      due_on: '2026-10-30',
      assignee_user_id: 'u-morgan',
    });
  });
});

describe('DealTodos assignment and feedback', () => {
  it('shows a new to-do right away while it saves', async () => {
    server.create.mockReturnValue(new Promise(() => {}));
    await render([]);

    await add('Send NDA');

    expect(container.querySelector('li')?.textContent).toContain('Send NDA');
    expect(container.textContent).not.toContain('No to-dos yet');
  });

  it('assigns a new to-do to the chosen teammate', async () => {
    await render([]);

    await act(async () => {
      setValue(
        container.querySelector('select[aria-label="Assign to"]')!,
        'u-priya',
      );
    });
    await add('Pull the leases');

    expect(server.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Pull the leases',
        assignee_user_id: 'u-priya',
      }),
    );
  });

  it('shows who holds each to-do and hands it to another teammate', async () => {
    await render([
      {
        id: 't-1',
        title: 'Send NDA',
        done: false,
        due_at: null,
        user_id: 'u-priya',
      },
    ]);

    const holder = container.querySelector<HTMLSelectElement>(
      'select[aria-label="Assignee for Send NDA"]',
    )!;

    expect(holder.selectedOptions[0]?.textContent).toBe('Priya Shah');

    await act(async () => setValue(holder, 'u-morgan'));

    expect(server.assign).toHaveBeenCalledWith({
      id: 't-1',
      assignee_user_id: 'u-morgan',
    });
  });

  it('says why a to-do was not added', async () => {
    server.create.mockResolvedValue({
      ok: false,
      refusal: 'Only deal managers can add to-dos.',
    });
    await render([]);

    await add('Send NDA');

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      'Only deal managers can add to-dos.',
    );
  });
});
