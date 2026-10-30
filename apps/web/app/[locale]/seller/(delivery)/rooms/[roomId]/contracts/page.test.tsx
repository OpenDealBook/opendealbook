// @vitest-environment jsdom
import {
  Children,
  type ReactElement,
  type ReactNode,
  act,
  isValidElement,
} from 'react';

import { type Root, createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeRealtime } from '../../../../../home/_components/fake-realtime';

const world = vi.hoisted(() => ({
  signedIn: true,
  rooms: [] as { id: string; deal_id: string }[],
  tables: {} as Record<string, unknown[]>,
  confirm: vi.fn(),
  readOnlyReason: null as string | null,
  contracts: [] as object[],
  reads: [] as { table: string; columns: string }[],
}));

const apa = {
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
};

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

        if (method === 'select') {
          return (columns: string) => {
            world.reads.push({ table, columns });
            return chain;
          };
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
  sellerSideContracts: async () => world.contracts,
  versionComments: async (_client: unknown, ids: string[]) =>
    Object.fromEntries(ids.map((id) => [id, []])),
  decideContractReview: vi.fn(),
  sellerConfirmContractReview: world.confirm,
}));
vi.mock('@odb/contracts/server', () => ({}));

import { ContractList } from '../../../../../counsel/[dealId]/contracts/contract-list';
import SellerRoomContractsPage from './page';

const roomId = '22222222-2222-4222-8222-222222222222';

function open(id = roomId) {
  return SellerRoomContractsPage({ params: Promise.resolve({ roomId: id }) });
}

const mounted: Root[] = [];

afterEach(() => {
  act(() => mounted.splice(0).forEach((root) => root.unmount()));
});

async function render() {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div');
  const page = await open();
  const root = createRoot(container);

  mounted.push(root);
  act(() => root.render(page));

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
    world.contracts = [apa];
    world.reads = [];
    world.confirm.mockResolvedValue({ ok: true });
    world.tables = {
      deal: [{ account_id: 'team-1' }],
      deal_counsel: [],
      contract: [],
      contract_version: [],
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

    expect(world.reads.map(({ table }) => table)).not.toContain(
      'contract_version',
    );
    expect(world.reads.map(({ table }) => table)).not.toContain('contract');

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

  function contractsSentBy(page: ReactElement): unknown {
    return Children.toArray(
      (page.props as { children: ReactNode }).children,
    ).flatMap((child) =>
      isValidElement(child) && child.type === ContractList
        ? [(child.props as { contracts: unknown }).contracts]
        : [],
    );
  }

  describe('an LOI extension', () => {
    const loi = {
      id: 'loi-1',
      type: 'loi',
      versions: [
        {
          id: 'lv1',
          version: 1,
          party: 'buyer',
          change_summary: null,
          is_signed: true,
        },
      ],
    };

    function extensionShownAs(sellerVersionId: string) {
      world.rooms = [{ id: roomId, deal_id: 'deal-1' }];
      world.contracts = [
        loi,
        {
          id: 'e1',
          type: 'loi_extension',
          versions: [
            {
              id: sellerVersionId,
              version: 1,
              party: 'buyer',
              change_summary: null,
              is_signed: false,
            },
          ],
        },
      ];
    }

    it('never even reads the note the team wrote for the seller side', async () => {
      extensionShownAs('ev1');
      world.tables.contract = [
        {
          id: 'e1',
          parent_contract_id: 'loi-1',
          extends_to: '2026-12-15',
          noted_on: '2026-11-20',
          current_version: 1,
        },
      ];
      world.tables.contract_version = [
        {
          id: 'ev1',
          contract_id: 'e1',
          version: 1,
          extends_to: '2026-12-15',
          signing_status: null,
        },
      ];

      await render();

      expect(
        world.reads
          .filter(({ table }) => table === 'contract')
          .flatMap(({ columns }) => columns.split(/,\s*/)),
      ).not.toContain('note');
    });

    it('keeps the out for signature badge when the team starts an unshared version after sending a shared one', async () => {
      extensionShownAs('ev2');
      world.tables.contract = [
        {
          id: 'e1',
          parent_contract_id: 'loi-1',
          extends_to: '2026-12-15',
          note: null,
          noted_on: null,
          current_version: 3,
        },
      ];
      world.tables.contract_version = [
        {
          id: 'ev1',
          contract_id: 'e1',
          version: 1,
          extends_to: '2026-12-15',
          signing_status: null,
        },
        {
          id: 'ev2',
          contract_id: 'e1',
          version: 2,
          extends_to: '2026-12-15',
          signing_status: 'sent',
        },
        {
          id: 'ev3',
          contract_id: 'e1',
          version: 3,
          extends_to: '2026-12-15',
          signing_status: null,
        },
      ];

      const item = (await render()).querySelector('[data-extension]')!;

      expect(item.querySelector('[data-slot="badge"]')?.textContent).toBe(
        'Out for signature',
      );
    });

    function rescheduledAfterSharing(notedOn: string | null) {
      extensionShownAs('ev1');
      world.tables.contract = [
        {
          id: 'e1',
          parent_contract_id: 'loi-1',
          extends_to: '2026-12-22',
          noted_on: notedOn,
          current_version: 1,
        },
      ];
      world.tables.contract_version = [
        {
          id: 'ev1',
          contract_id: 'e1',
          version: 1,
          signing_status: null,
          extends_to: '2026-12-15',
        },
      ];
    }

    it('names the extension by the end date on the latest version the seller side can see', async () => {
      rescheduledAfterSharing(null);

      expect(
        (await render()).querySelector('[data-extension] h4')?.textContent,
      ).toBe('LOI extension to Dec 15, 2026');
    });

    it('names a noted extension by the end date that was agreed', async () => {
      rescheduledAfterSharing('2026-11-20');

      expect(
        (await render()).querySelector('[data-extension] h4')?.textContent,
      ).toBe('LOI extension to Dec 22, 2026');
    });

    it('never sends the seller side the note the team wrote on it, only the day it was agreed', async () => {
      extensionShownAs('ev1');
      world.tables.contract = [
        {
          id: 'e1',
          parent_contract_id: 'loi-1',
          extends_to: '2026-12-15',
          note: 'Seller is anxious to close, push for more',
          noted_on: '2026-11-20',
          current_version: 1,
        },
      ];
      world.tables.contract_version = [
        {
          id: 'ev1',
          contract_id: 'e1',
          version: 1,
          is_signed: false,
          extends_to: '2026-12-15',
          signing_status: null,
        },
      ];

      const page = await open();
      const container = await render();

      expect(JSON.stringify(contractsSentBy(page))).not.toContain(
        'push for more',
      );
      expect(
        container.querySelector('[data-extension-noted]')?.textContent,
      ).toBe('Agreed on Nov 20, 2026');
    });

    it("gives the seller side the extension's state and sign-off from the version it can see, whatever the team numbered it", async () => {
      extensionShownAs('ev2');
      world.tables.contract = [
        {
          id: 'e1',
          parent_contract_id: 'loi-1',
          extends_to: '2026-12-15',
          note: null,
          noted_on: null,
          current_version: 2,
        },
      ];
      world.tables.contract_version = [
        {
          id: 'ev1',
          contract_id: 'e1',
          version: 1,
          is_signed: false,
          extends_to: '2026-12-15',
          signing_status: null,
        },
        {
          id: 'ev2',
          contract_id: 'e1',
          version: 2,
          is_signed: false,
          extends_to: '2026-12-15',
          signing_status: 'sent',
        },
      ];

      const item = (await render()).querySelector('[data-extension]')!;

      expect(item.querySelector('[data-slot="badge"]')?.textContent).toBe(
        'Out for signature',
      );
      expect(
        [...item.querySelectorAll('[data-version-review] h3')].map(
          (heading) => heading.textContent,
        ),
      ).toEqual(['Sign-off on version 1']);
    });

    it('never shows a signed badge over the unsigned versions it shows in the same page', async () => {
      extensionShownAs('ev1');
      world.tables.contract = [
        {
          id: 'e1',
          parent_contract_id: 'loi-1',
          extends_to: '2026-12-15',
          note: null,
          noted_on: null,
          current_version: 1,
        },
      ];
      world.tables.contract_version = [
        {
          id: 'ev1',
          contract_id: 'e1',
          version: 1,
          is_signed: true,
          extends_to: '2026-12-15',
          signing_status: 'completed',
        },
      ];

      const item = (await render()).querySelector('[data-extension]')!;

      expect(item.querySelector('[data-slot="badge"]')?.textContent).toBe(
        'Out for signature',
      );
      expect(item.querySelector('[data-extension-actions] a')).toBeNull();
    });
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
