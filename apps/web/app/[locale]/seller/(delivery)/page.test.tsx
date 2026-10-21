import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({ signedIn: false }));

vi.mock('@odb/lender-rooms/members/room-gate.ts', () => ({
  isSignedIn: async () => session.signedIn,
}));
vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({
    rpc: (name: string) => ({
      throwOnError: async () => ({
        data:
          name === 'my_seller_rooms'
            ? [
                {
                  id: 'room-1',
                  deal_name: 'Brennan Climate',
                  team_name: 'Acme Partners',
                  is_open: true,
                },
              ]
            : [],
      }),
    }),
  }),
}));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`redirect ${path}`);
  },
}));

import SellerRoomsPage from './page';

describe('the seller rooms list', () => {
  it('sends a signed-out visitor to the seller sign-in', async () => {
    session.signedIn = false;

    await expect(SellerRoomsPage()).rejects.toThrow('redirect /seller/sign-in');
  });

  it('names each room by the business being sold, with the team', async () => {
    session.signedIn = true;

    const html = renderToStaticMarkup(await SellerRoomsPage());

    expect(html).toContain('Selling Brennan Climate');
    expect(html).toContain('with Acme Partners');
  });
});
