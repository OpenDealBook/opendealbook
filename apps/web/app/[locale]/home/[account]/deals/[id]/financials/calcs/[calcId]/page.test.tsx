import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';

import TeamDealCalcPage from './page';

vi.mock(
  'next/navigation',
  async () => (await import('../calc-route-test-kit')).routeMocks.navigation,
);
vi.mock(
  '@odb/deals',
  async () => (await import('../calc-route-test-kit')).routeMocks.deals,
);
vi.mock('@odb/deals/server', () => ({}));
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

function open(calcId: string, id = 'deal-1') {
  return TeamDealCalcPage({
    params: Promise.resolve({ account: 'acme', id, calcId }),
  });
}

it('shows a calc version of this deal', async () => {
  expect(renderToStaticMarkup(await open('wc-1'))).toContain(
    'Q3 working capital',
  );
});

it('is not found for an unknown calc id', async () => {
  await expect(open('missing')).rejects.toThrow('NEXT_NOT_FOUND');
});

it('is not found for a calc that belongs to another deal', async () => {
  await expect(open('wc-other')).rejects.toThrow('NEXT_NOT_FOUND');
});

it("is not found for another team's deal", async () => {
  await expect(open('wc-x1', 'deal-x')).rejects.toThrow('NEXT_NOT_FOUND');
});
