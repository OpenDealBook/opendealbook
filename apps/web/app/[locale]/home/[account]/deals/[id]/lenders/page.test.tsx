import { describe, expect, it, vi } from 'vitest';

const DEAL = '1b0f2c0e-6c0f-4f43-9c53-0d7a4c1f1a11';

const world = vi.hoisted(() => ({ manages: false }));

vi.mock('../../../layout', () => ({
  loadTeamWorkspace: async () => ({
    team: { id: 'team-1', name: 'Acme', slug: 'acme' },
    user: { id: 'member-1' },
    permissions: ['deals.work'],
  }),
}));
vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({
    rpc: (name: string) => ({
      throwOnError: async () => ({
        data: name === 'manages_deal_in_account' ? world.manages : null,
      }),
    }),
  }),
  getSupabaseServerAdminClient: () => ({}),
}));
vi.mock('@odb/lender-rooms/rooms/actions.ts', () => ({
  listLenderRooms: async () => {
    throw new Error(
      'listed lender rooms for someone who cannot manage the deal',
    );
  },
}));
vi.mock('../../../../_components/lender-crm/deal-lender-crm', () => ({
  DealLenderCrm: () => null,
}));

import TeamDealLendersPage from './page';

describe('the lender rooms route', () => {
  it('is not found for a member who cannot manage the deal', async () => {
    await expect(
      TeamDealLendersPage({
        params: Promise.resolve({ account: 'acme', id: DEAL }),
      })
        .then(
          (page) =>
            (
              page.props as {
                children: Array<{
                  type: (props: unknown) => Promise<unknown>;
                  props: unknown;
                }>;
              }
            ).children[0]!,
        )
        .then((rooms) => rooms.type(rooms.props)),
    ).rejects.toMatchObject({ digest: expect.stringContaining('404') });
  });
});
