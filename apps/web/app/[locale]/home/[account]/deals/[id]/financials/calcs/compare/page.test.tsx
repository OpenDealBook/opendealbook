import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';

import TeamDealCalcComparePage from './page';

vi.mock(
  'next/navigation',
  async () => (await import('../calc-route-test-kit')).routeMocks.navigation,
);
vi.mock(
  '@odb/deals',
  async () => (await import('../calc-route-test-kit')).routeMocks.deals,
);
vi.mock(
  '@odb/deals/shared',
  async () => (await import('../calc-route-test-kit')).routeMocks.dealsShared,
);
vi.mock(
  '@odb/supabase/server',
  async () => (await import('../calc-route-test-kit')).routeMocks.supabase,
);
vi.mock(
  '../../../../../layout',
  async () => (await import('../calc-route-test-kit')).routeMocks.layout,
);
vi.mock('../../../../../../_lib/deal-calc-defaults', async () => ({
  loadDealCalcDefaults: async () =>
    (
      await vi.importActual<
        typeof import('../../../../../../_lib/deal-calc-defaults')
      >('../../../../../../_lib/deal-calc-defaults')
    ).parseDealCalcDefaults(null),
}));

function compare(query: Record<string, string>, id = 'deal-1') {
  return TeamDealCalcComparePage({
    params: Promise.resolve({ account: 'acme', id }),
    searchParams: Promise.resolve(query),
  });
}

it('compares two versions of the same calc on this deal', async () => {
  const html = renderToStaticMarkup(await compare({ a: 'wc-1', b: 'wc-2' }));

  expect(html).toContain('Q3 working capital');
  expect(html).toContain('Q4 working capital');
});

it.each([
  ['b is missing', { a: 'wc-1' }],
  ['a is missing', { b: 'wc-2' }],
  ['a version is unknown', { a: 'wc-1', b: 'missing' }],
  ['a version belongs to another deal', { a: 'wc-other', b: 'wc-1' }],
  ['the versions are different calc types', { a: 'wc-1', b: 'deal-a' }],
])('is not found when %s', async (_case, query) => {
  await expect(compare(query)).rejects.toThrow('NEXT_NOT_FOUND');
});

it("is not found for another team's deal", async () => {
  await expect(compare({ a: 'wc-x1', b: 'wc-x2' }, 'deal-x')).rejects.toThrow(
    'NEXT_NOT_FOUND',
  );
});
