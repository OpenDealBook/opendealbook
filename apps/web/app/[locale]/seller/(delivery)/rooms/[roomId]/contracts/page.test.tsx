// @vitest-environment jsdom
import { act } from 'react';

import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeRealtime } from '../../../../../home/_components/fake-realtime';

const world = vi.hoisted(() => ({
  signedIn: true,
  rooms: [] as { id: string; deal_id: string }[],
  tables: {} as Record<string, unknown[]>,
  confirm: vi.fn(),
  readOnlyReason: null as string | null,
}));

function rows(table: string) {
  let single = false;
  const chain: Record<string, unknown> = new Proxy(
    {},
    {
      get: (_target, method) => {
        if (method === 'throwOnError') {
          return async () => ({
            data: single ? world.tables[table]![0] : world.tables[table],
          });
        }

        if (method === 'single') {
          single = true;
        }

        return () => chain;
      },
    },
  );

  return chain;
}

vi.mock('@odb/supabase/hooks', () => ({
  useSupabase: () => fakeRealtime().client,
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('not found');
  },
  redirect: (path: string) => {
    throw new Error(`redirect ${path}`);
  },
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock('@odb/lender-rooms/members/room-gate.ts', () => ({
  isSignedIn: async () => world.signedIn,
}));
vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({
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
        : name === 'seller_side_read_only_reason'
          ? { throwOnError: async () => ({ data: world.readOnlyReason }) }
          : { throwOnError: async () => ({ data: false }) },
  }),
}));
vi.mock('@odb/supabase/admin', () => ({
  getSupabaseServerAdminClient: () => ({
    from: rows,
    rpc: () => ({ throwOnError: async () => ({ data: false }) }),
  }),
}));
vi.mock('@odb/contracts', () => ({
  contractVersionViews: async (_admin: unknown, versions: object[]) =>
    versions.map((version) => ({
      ...version,
      hasDocx: false,
      hasPdf: false,
      redline: null,
    })),
  sellerSideContracts: async () => [
    {
      id: 'c1',
      type: 'apa',
      versions: [
        {
          id: 'v1',
          version: 1,
          party: 'buyer',
          change_summary: null,
          is_signed: false,
        },
      ],
    },
  ],
  versionComments: async () => ({ v1: [] }),
  decideContractReview: vi.fn(),
  sellerConfirmContractReview: world.confirm,
}));
vi.mock('@odb/contracts/server', () => ({}));

import SellerRoomContractsPage from './page';

const roomId = '22222222-2222-4222-8222-222222222222';

function open(id = roomId) {
  return SellerRoomContractsPage({ params: Promise.resolve({ roomId: id }) });
}

async function render() {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div');
  const page = await open();

  act(() => createRoot(container).render(page));

  return container;
}

function buttons(container: HTMLElement) {
  return [
    ...container.querySelectorAll('[data-version-review] button'),
  ] as HTMLButtonElement[];
}

describe('the seller room contracts page', () => {
  beforeEach(() => {
    world.signedIn = true;
    world.rooms = [];
    world.confirm.mockReset();
    world.readOnlyReason = null;
    world.confirm.mockResolvedValue({ ok: true });
    world.tables = {
      deal: [{ account_id: 'team-1' }],
      deal_counsel: [],
      contract_review_request: [
        {
          id: 'q1',
          contract_version_id: 'v1',
          requested_by: 'u1',
          requested_at: '2026-10-12T15:00:00Z',
        },
      ],
      contract_review_decision: [
        {
          id: 'd1',
          contract_version_id: 'v1',
          decision: 'approved',
          note: null,
          decided_at: '2026-10-13T15:00:00Z',
          without_counsel: false,
        },
      ],
      accounts: [{ primary_owner_user_id: 'u1', name: 'Olive Owner' }],
    };
  });

  it('sends a visitor who is not signed in to the seller sign-in, coming back here', async () => {
    world.signedIn = false;

    await expect(open()).rejects.toThrow(
      `redirect /seller/sign-in?next=%2Fseller%2Frooms%2F${roomId}%2Fcontracts`,
    );
  });

  it('is not found for someone outside the room', async () => {
    await expect(open()).rejects.toThrow('not found');
  });

  it('is not found for an address that is not a room', async () => {
    await expect(open('not-a-room')).rejects.toThrow('not found');
  });

  it('lets a seller without counsel confirm a version that was sent for review', async () => {
    world.rooms = [{ id: roomId, deal_id: 'deal-1' }];

    const container = await render();

    expect(container.querySelector('[data-review-request]')?.textContent).toBe(
      'Review requested by Olive Owner on Oct 12, 2026',
    );
    expect(buttons(container).map((button) => button.textContent)).toEqual([
      'Approve',
      'Approve with comments',
      'Changes needed',
    ]);

    await act(async () => buttons(container)[0]!.click());

    expect(world.confirm).toHaveBeenCalledWith({
      contractVersionId: 'v1',
      decision: 'approved',
      note: undefined,
    });
  });

  it("shows a seller with counsel their counsel's answer without asking them for one", async () => {
    world.rooms = [{ id: roomId, deal_id: 'deal-1' }];
    world.tables.deal_counsel = [{ id: 'counsel-1' }];

    const container = await render();

    expect(container.querySelector('[data-review-decision]')?.textContent).toBe(
      'Approved on Oct 13, 2026',
    );
    expect(buttons(container)).toEqual([]);
  });

  it('shows the reason and asks for no answer once the room is read-only', async () => {
    world.rooms = [{ id: roomId, deal_id: 'deal-1' }];
    world.readOnlyReason = 'The seller room is closed, so this is read-only.';

    const container = await render();

    expect(buttons(container)).toEqual([]);
    expect(container.textContent).toContain(
      'The seller room is closed, so this is read-only.',
    );
  });
});
