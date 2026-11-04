// @vitest-environment jsdom

import { NextIntlClientProvider } from 'next-intl';
import { renderToPipeableStream } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import messages from '../../../../../../messages/en.json';
import TeamDealLayout from './layout';

import { Writable } from 'node:stream';

const db = vi.hoisted(() => ({
  deals: [] as { id: string; account_id: string }[],
}));

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  usePathname: () => '/home/harbor/deals/d1/documents',
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@odb/deals', () => ({
  fetchAccountStages: () => new Promise(() => {}),
  fetchDealOffers: () => new Promise(() => {}),
}));
vi.mock('@odb/deals/server', () => ({}));
vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      const query = {
        select: () => query,
        eq(column: string, value: unknown) {
          filters[column] = value;
          return query;
        },
        neq: () => query,
        order: () => query,
        throwOnError: async () => ({ data: [] }),
        maybeSingle: async () => ({
          data:
            table === 'deal'
              ? (db.deals.find((deal) =>
                  Object.entries(filters).every(
                    ([column, value]) =>
                      deal[column as keyof typeof deal] === value,
                  ),
                ) ?? null)
              : null,
        }),
      };
      return query;
    },
  }),
}));
vi.mock('../../../_components/lender-manages-deal', () => ({
  managesDeal: vi.fn(),
}));
vi.mock('../../../_components/item-focus', () => ({ ItemFocus: () => null }));
vi.mock('../../layout', () => ({
  loadTeamWorkspace: async () => ({
    user: { id: 'u1' },
    team: { id: 't1' },
    permissions: [],
    isOwner: false,
  }),
}));

const params = Promise.resolve({ account: 'harbor', id: 'd1' });

beforeEach(() => {
  db.deals = [{ id: 'd1', account_id: 't1' }];
});

async function renderShell(): Promise<string> {
  const layout = await TeamDealLayout({
    children: <p>Deal tab content</p>,
    params,
  });

  return new Promise((resolve) => {
    let html = '';
    const sink = new Writable({
      write(chunk, _encoding, done) {
        html += chunk;
        done();
      },
    });
    const stream = renderToPipeableStream(
      <NextIntlClientProvider locale={'en'} messages={messages}>
        {layout}
      </NextIntlClientProvider>,
      {
        onShellReady() {
          stream.pipe(sink);
          setImmediate(() => {
            stream.abort();
            resolve(html);
          });
        },
      },
    );
  });
}

describe('TeamDealLayout', () => {
  it.each([
    ['does not exist', []],
    ['belongs to another team', [{ id: 'd1', account_id: 't2' }]],
  ])(
    'answers not found before streaming when the deal %s',
    async (_case, deals) => {
      db.deals = deals;

      await expect(TeamDealLayout({ children: null, params })).rejects.toThrow(
        'NEXT_NOT_FOUND',
      );
    },
  );

  it('shows the deal header skeleton with usable tabs and the tab content while the header data is pending', async () => {
    document.body.innerHTML = await renderShell();

    const status = document.querySelector('[role="status"]');
    expect(status?.getAttribute('aria-busy')).toBe('true');
    expect(status?.getAttribute('aria-label')).toBe('Loading deal');
    expect(
      [...document.querySelectorAll('nav a')].map((link) => [
        link.textContent,
        link.getAttribute('href'),
      ]),
    ).toContainEqual(['Documents', '/home/harbor/deals/d1/documents']);
    expect(document.body.textContent).toContain('Deal tab content');
  });
});
