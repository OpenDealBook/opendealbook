import { beforeEach, describe, expect, it, vi } from 'vitest';

const world = vi.hoisted(() => ({
  signedIn: true,
  rooms: [] as { id: string; deal_id: string }[],
  isSeller: true,
}));

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('not found');
  },
  redirect: (path: string) => {
    throw new Error(`redirect ${path}`);
  },
}));
vi.mock('@odb/lender-rooms/members/room-gate.ts', () => ({
  isSignedIn: async () => world.signedIn,
}));
vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'seller-1' } } }) },
    rpc: (name: string) =>
      name === 'my_seller_rooms'
        ? {
            eq: (_column: string, roomId: string) => ({
              maybeSingle: () => ({
                throwOnError: async () => ({
                  data: world.rooms.find((room) => room.id === roomId) ?? null,
                }),
              }),
            }),
          }
        : { throwOnError: async () => ({ data: world.isSeller }) },
  }),
}));
vi.mock('@odb/supabase/admin', () => ({
  getSupabaseServerAdminClient: () => ({}),
}));
vi.mock('@odb/seller-rooms/counsel-thread/queries.ts', () => ({
  loadSellerCounselThread: async () => {
    throw new Error('opened the thread');
  },
  loadSellerSide: async () => {
    throw new Error('opened the thread');
  },
}));

import SellerCounselThreadPage from './page';

const roomId = '22222222-2222-4222-8222-222222222222';

function open(id = roomId) {
  return SellerCounselThreadPage({ params: Promise.resolve({ roomId: id }) });
}

describe('the seller counsel thread page', () => {
  beforeEach(() => {
    world.signedIn = true;
    world.rooms = [{ id: roomId, deal_id: 'deal-1' }];
    world.isSeller = true;
  });

  it('is not found for an address that is not a room', async () => {
    await expect(open('not-a-room')).rejects.toThrow('not found');
  });

  it('sends a visitor who is not signed in to the seller sign-in, coming back here', async () => {
    world.signedIn = false;

    await expect(open()).rejects.toThrow(
      `redirect /seller/sign-in?next=%2Fseller%2Frooms%2F${roomId}%2Fcounsel`,
    );
  });

  it('is not found for someone outside the room', async () => {
    world.rooms = [];

    await expect(open()).rejects.toThrow('not found');
  });

  it("is not found for the seller's counsel, who use their own portal", async () => {
    world.isSeller = false;

    await expect(open()).rejects.toThrow('not found');
  });

  it('opens the thread for the seller', async () => {
    await expect(open()).rejects.toThrow('opened the thread');
  });
});
