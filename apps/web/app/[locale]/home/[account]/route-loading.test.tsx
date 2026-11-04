// @vitest-environment jsdom
import type { ComponentType } from 'react';

import { NextIntlClientProvider } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import messages from '../../../../messages/en.json';

const search = vi.hoisted(() => ({ query: '' }));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(search.query),
}));

const translated = {
  loading: {
    deals: 'T deals',
    ai: 'T ai',
  },
};

function render(Loading: ComponentType, withMessages: object = translated) {
  document.body.innerHTML = renderToStaticMarkup(
    <NextIntlClientProvider locale={'en'} messages={withMessages}>
      <Loading />
    </NextIntlClientProvider>,
  );
}

const routes: [string, string, () => Promise<{ default: ComponentType }>][] = [
  ['deals', 'T deals', () => import('./deals/(list)/loading')],
  ['team AI', 'T ai', () => import('./ai/loading')],
];

beforeEach(() => {
  search.query = '';
});

describe('route loading skeletons', () => {
  it.each(routes)(
    'announces the %s route as busy with its translated label',
    async (_route, label, load) => {
      render((await load()).default);

      const status = document.querySelector('[role="status"]');

      expect(status?.getAttribute('aria-busy')).toBe('true');
      expect(status?.getAttribute('aria-label')).toBe(label);
    },
  );

  it('ships an English label for every loading screen', async () => {
    for (const [, , load] of routes) {
      render((await load()).default, messages);

      expect(
        document.querySelector('[role="status"]')?.getAttribute('aria-label'),
      ).toMatch(/^Loading /);
    }
  });
});

describe('deals loading view', () => {
  async function renderDeals(query: string) {
    search.query = query;
    render((await import('./deals/(list)/loading')).default);
    const status = document.querySelector('[role="status"]')!;
    return {
      tables: status.querySelectorAll('table'),
      rows: status.querySelectorAll('table tbody tr'),
      cards: status.querySelectorAll('[data-slot="card"]'),
    };
  }

  it('shows cards by default, like the deals list', async () => {
    const shape = await renderDeals('');

    expect(shape.cards.length).toBeGreaterThan(0);
    expect(shape.tables).toHaveLength(0);
  });

  it('shows a table with rows when the table view is chosen', async () => {
    const shape = await renderDeals('view=table');

    expect(shape.tables).toHaveLength(1);
    expect(shape.rows.length).toBeGreaterThan(0);
    expect(shape.cards).toHaveLength(0);
  });

  it('falls back to cards for an unknown view', async () => {
    const shape = await renderDeals('view=grid');

    expect(shape.cards.length).toBeGreaterThan(0);
    expect(shape.tables).toHaveLength(0);
  });

  it('keeps the serif Deals page title', async () => {
    await renderDeals('');

    expect(document.querySelector('h1')?.textContent).toBe('Deals');
  });
});
