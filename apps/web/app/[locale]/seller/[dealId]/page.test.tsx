import { beforeEach, describe, expect, it, vi } from 'vitest';

const world = vi.hoisted(() => ({
  signedIn: true,
  rooms: [] as { id: string; deal_id: string; is_open: boolean }[],
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
    rpc: () => ({
      eq: (_column: string, dealId: string) => ({
        maybeSingle: () => ({
          throwOnError: async () => ({
            data: world.rooms.find((room) => room.deal_id === dealId) ?? null,
          }),
        }),
      }),
    }),
  }),
}));

import OldSellerPortalPage from './page';

const dealId = '11111111-1111-4111-8111-111111111111';
const roomId = '22222222-2222-4222-8222-222222222222';

function open() {
  return OldSellerPortalPage({
    params: Promise.resolve({ locale: 'en', dealId }),
  });
}

describe('the old seller portal address', () => {
  beforeEach(() => {
    world.signedIn = true;
    world.rooms = [];
  });

  it('sends a visitor who is not signed in to the seller sign-in, coming back here', async () => {
    world.signedIn = false;

    await expect(open()).rejects.toThrow(
      `redirect /seller/sign-in?next=%2Fseller%2F${dealId}`,
    );
  });

  it("sends a seller to their deal's room", async () => {
    world.rooms = [{ id: roomId, deal_id: dealId, is_open: true }];

    await expect(open()).rejects.toThrow(`redirect /seller/rooms/${roomId}`);
  });

  it('sends a seller to the room even when it is closed', async () => {
    world.rooms = [{ id: roomId, deal_id: dealId, is_open: false }];

    await expect(open()).rejects.toThrow(`redirect /seller/rooms/${roomId}`);
  });

  it('sends a seller with no room for the deal to their rooms list', async () => {
    world.rooms = [
      {
        id: roomId,
        deal_id: '33333333-3333-4333-8333-333333333333',
        is_open: true,
      },
    ];

    await expect(open()).rejects.toThrow('redirect /seller');
    await expect(open()).rejects.not.toThrow(`/seller/rooms/${roomId}`);
  });
});
