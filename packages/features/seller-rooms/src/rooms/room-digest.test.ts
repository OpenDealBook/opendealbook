import type { SupabaseClient } from '@supabase/supabase-js';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Database } from '@odb/supabase';

const state = vi.hoisted(() => ({
  triggered: [] as Record<string, unknown>[],
  triggerFails: false,
  logged: [] as unknown[],
}));

vi.mock('@odb/notifications/server', () => ({
  createNovuClient: () => ({}),
  triggerNotification: async (
    _deps: unknown,
    input: Record<string, unknown>,
  ) => {
    if (state.triggerFails) {
      throw new Error('novu down');
    }
    state.triggered.push(input);
  },
}));

vi.mock('@odb/shared/logger', () => ({
  getLogger: () => ({ error: (...args: unknown[]) => state.logged.push(args) }),
}));

import { queueForSellerDigest } from './room-digest';

const shown = {
  kind: 'folder' as const,
  roomId: 'room-1',
  folderId: 'folder-1',
};

function fakeAdmin(
  options: { alreadyAnnounced?: boolean; memberReadFails?: boolean } = {},
) {
  const reads: string[] = [];
  const admin = {
    from: (table: string) => {
      reads.push(table);

      if (table === 'seller_room_announcement') {
        return {
          upsert: () => ({
            select: () => ({
              throwOnError: async () => ({
                data: options.alreadyAnnounced ? [] : [{ item_id: 'folder-1' }],
              }),
            }),
          }),
        };
      }

      if (table === 'accounts') {
        return {
          select: () => ({
            in: () => ({
              throwOnError: async () => ({
                data: [
                  { id: 'seller-1', timezone: 'America/Denver' },
                  { id: 'seller-2', timezone: null },
                ],
              }),
            }),
          }),
        };
      }

      return {
        select: () => ({
          eq: () => ({
            throwOnError: async () => {
              if (options.memberReadFails) {
                throw new Error('database down');
              }

              return {
                data: [
                  { user_id: 'seller-1', email: 'one@seller.test' },
                  { user_id: 'seller-2', email: 'two@seller.test' },
                ],
              };
            },
          }),
        }),
      };
    },
  } as unknown as SupabaseClient<Database>;

  return { admin, reads };
}

beforeEach(() => {
  vi.stubEnv('NOVU_API_KEY', 'test-novu-key');
  vi.stubEnv('NOVU_API_URL', 'https://novu.test');
  state.triggered = [];
  state.triggerFails = false;
  state.logged = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('queueForSellerDigest', () => {
  it('does nothing when Novu is not configured', async () => {
    vi.stubEnv('NOVU_API_KEY', undefined);
    const { admin, reads } = fakeAdmin();

    await queueForSellerDigest(admin, shown);

    expect(reads).toEqual([]);
    expect(state.triggered).toEqual([]);
  });

  it('announces a first-time share to every seller in the room', async () => {
    const { admin } = fakeAdmin();

    await queueForSellerDigest(admin, shown);

    expect(state.triggered).toEqual([
      expect.objectContaining({
        eventType: 'seller-room-shared',
        recipientUserId: 'seller-1',
        payload: expect.objectContaining(shown),
      }),
      expect.objectContaining({
        eventType: 'seller-room-shared',
        recipientUserId: 'seller-2',
        payload: expect.objectContaining(shown),
      }),
    ]);
  });

  it("carries each seller's time zone so the digest goes out in their evening", async () => {
    const { admin } = fakeAdmin();

    await queueForSellerDigest(admin, shown);

    expect(state.triggered.map((input) => input.payload)).toEqual([
      { ...shown, timezone: 'America/Denver' },
      shown,
    ]);
  });

  it('does not announce something the room was already told about', async () => {
    const { admin } = fakeAdmin({ alreadyAnnounced: true });

    await queueForSellerDigest(admin, shown);

    expect(state.triggered).toEqual([]);
  });

  it('logs a Novu failure instead of failing the team change', async () => {
    state.triggerFails = true;
    const { admin } = fakeAdmin();

    await expect(queueForSellerDigest(admin, shown)).resolves.toBeUndefined();
    expect(state.logged).toHaveLength(1);
  });

  it('lets a failed member read fail loudly', async () => {
    const { admin } = fakeAdmin({ memberReadFails: true });

    await expect(queueForSellerDigest(admin, shown)).rejects.toThrow(
      'database down',
    );
  });
});
