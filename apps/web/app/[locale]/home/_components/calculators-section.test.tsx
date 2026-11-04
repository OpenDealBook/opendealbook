import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ manages: false, works: true }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh() {}, push() {} }),
}));
vi.mock('@odb/deals/server', () => ({}));
vi.mock('@odb/deals', () => ({
  fetchDealCalcVersions: async () => [
    {
      id: 'v-1',
      name: 'Base case',
      type: 'deal',
      is_primary: false,
      outputs_snapshot: {},
    },
  ],
}));
vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({
    rpc: (
      name: string,
      args: { deal_id: string; account_id?: string; permission?: string },
    ) => ({
      throwOnError: async () => ({
        data:
          args.deal_id === 'deal-1' &&
          ((name === 'manages_deal_in_account' &&
            args.account_id === 'team-1' &&
            db.manages) ||
            (name === 'has_deal_permission' &&
              args.permission === 'deals.work' &&
              db.works)),
      }),
    }),
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => ({
            throwOnError: async () => ({ data: { slug: 'acme' } }),
          }),
        }),
      }),
    }),
  }),
}));

import { CalculatorsSection } from './calculators-section';

async function render() {
  return renderToStaticMarkup(
    await CalculatorsSection({ dealId: 'deal-1', accountId: 'team-1' }),
  );
}

const REASON = 'Only deal managers can mark a calc primary or adopt it.';

describe('CalculatorsSection', () => {
  it('locks Mark primary and Adopt for someone who does not manage the deal', async () => {
    db.manages = false;

    expect(await render()).toContain(REASON);
  });

  it('lets a deal manager mark primary and adopt', async () => {
    db.manages = true;

    expect(await render()).not.toContain(REASON);
  });

  it('offers New calculator buttons only to someone with deals.work on the deal', async () => {
    db.works = true;
    expect(await render()).toContain('New SDE');

    db.works = false;
    expect(await render()).not.toContain('New SDE');
    db.works = true;
  });

  it('links each calc version to its page under the deal financials', async () => {
    expect(await render()).toContain(
      'href="/home/acme/deals/deal-1/financials/calcs/v-1"',
    );
  });
});
