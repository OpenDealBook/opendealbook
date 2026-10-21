// @vitest-environment jsdom
import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MyTodos, MyWorkItem } from '@odb/deals';

import { MyTodosView } from './my-todos-view';

const deal = { id: 'd-1', name: 'Brennan Climate' };

function checklist(
  title: string,
  status: 'not_started' | 'requested' | 'received' | 'reviewed',
  due_at: string | null,
): MyWorkItem {
  return {
    kind: 'checklist',
    id: `c-${title}`,
    title,
    status,
    done: status === 'received' || status === 'reviewed',
    due_at,
    deal,
  };
}

function todo(title: string, done: boolean, due_at: string | null): MyWorkItem {
  return { kind: 'todo', id: `t-${title}`, title, done, due_at, deal };
}

let container: HTMLDivElement;
let root: Root;

async function render(value: MyTodos) {
  await act(async () => {
    root.render(<MyTodosView data={value} dealHref={(id) => `/deals/${id}`} />);
  });
}

function section(name: string) {
  return [...container.querySelectorAll('section')].find(
    (element) => element.querySelector('h3')?.textContent === name,
  );
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
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe('MyTodosView', () => {
  it('names the deal on every row and links to it', async () => {
    await render([todo('Call broker', false, null)]);

    const link = container.querySelector('li a');

    expect(link?.textContent).toBe('Brennan Climate');
    expect(link?.getAttribute('href')).toBe('/deals/d-1');
  });

  it('lists checklist items and to-dos together, saying which is which', async () => {
    await render([
      checklist('NDA', 'requested', null),
      todo('Call broker', false, null),
    ]);

    const rows = [...container.querySelectorAll('li')].map(
      (row) => row.textContent,
    );

    expect(rows[0]).toContain('Checklist');
    expect(rows[0]).toContain('NDA');
    expect(rows[1]).toContain('To-do');
    expect(rows[1]).toContain('Call broker');
  });

  it('puts open work past its due date in an Overdue section first', async () => {
    await render([
      checklist('Leases', 'requested', '2026-10-30T00:00:00Z'),
      todo('Call broker', false, '2026-10-01T00:00:00Z'),
      checklist('NDA', 'reviewed', '2026-10-01T00:00:00Z'),
    ]);

    const overdue = section('Overdue');

    expect(container.querySelector('section')).toBe(overdue);
    expect(overdue?.textContent).toContain('Call broker');
    expect(overdue?.textContent).not.toContain('Leases');
    expect(overdue?.textContent).not.toContain('NDA');
  });

  it('shows no Overdue section when nothing is late', async () => {
    await render([todo('Call broker', false, '2026-10-30T00:00:00Z')]);

    expect(section('Overdue')).toBeUndefined();
  });

  it('shows the due date as a long date', async () => {
    await render([checklist('NDA', 'requested', '2026-10-30T00:00:00Z')]);

    expect(container.textContent).toContain('Due October 30, 2026');
    expect(container.querySelector('.text-destructive')).toBeNull();
  });

  it.each(['received', 'reviewed'] as const)(
    'does not show a %s item past its due date in red',
    async (status) => {
      await render([checklist('NDA', status, '2026-10-01T00:00:00Z')]);

      expect(container.querySelector('.text-destructive')).toBeNull();
      expect(container.textContent).not.toContain('Overdue');
    },
  );

  it('does not show a done to-do past its due date in red', async () => {
    await render([todo('Call broker', true, '2026-10-01T00:00:00Z')]);

    expect(container.querySelector('.text-destructive')).toBeNull();
    expect(container.textContent).not.toContain('Overdue');
  });

  it('shows no due text for an item without a due date', async () => {
    await render([checklist('NDA', 'requested', null)]);

    expect(container.textContent).not.toContain('Due');
  });
});
