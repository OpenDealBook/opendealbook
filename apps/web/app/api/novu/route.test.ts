import { afterEach, describe, expect, it, vi } from 'vitest';

import { createHmac } from 'node:crypto';

const roomRow = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
}));

const rpcRows = vi.hoisted(() => ({
  current: {} as Record<string, unknown[]>,
}));

const authorRow = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
}));

const counselRow = vi.hoisted(() => ({
  current: null as Record<string, unknown> | null,
}));

const sellerRooms = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  managedAccounts: new Set<string>(),
}));

vi.mock('@odb/supabase/admin', () => ({
  getSupabaseServerAdminClient: () => ({
    rpc: (name: string, args: Record<string, string>) => ({
      throwOnError: async () => ({
        data:
          name === 'has_permission'
            ? sellerRooms.managedAccounts.has(args.account_id!)
            : rpcRows.current[name],
      }),
    }),
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: () => ({
            throwOnError: async () => ({
              data: table === 'accounts' ? authorRow.current : roomRow.current,
            }),
          }),
          eq: () => ({
            limit: () => ({
              maybeSingle: () => ({
                throwOnError: async () => ({
                  data: table === 'deal_counsel' ? counselRow.current : null,
                }),
              }),
            }),
          }),
        }),
        in: () => ({
          throwOnError: async () => ({ data: sellerRooms.rows }),
        }),
      }),
    }),
  }),
}));

async function importRoute(
  novuApiKey: string | undefined,
  digestIntervalMinutes?: string,
) {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://supabase.test');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
  vi.stubEnv('STRIPE_SECRET_KEY', 'test-stripe-secret-key');
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'test-stripe-webhook-secret');
  vi.stubEnv('GOTENBERG_URL', 'http://gotenberg.test');
  vi.stubEnv('NOVU_API_KEY', novuApiKey);
  vi.stubEnv('LENDER_DIGEST_INTERVAL_MINUTES', digestIntervalMinutes);

  return import('./route');
}

async function executeSigned(
  POST: (request: Request) => Promise<Response>,
  workflowId: string,
  stepId: string,
  payload: Record<string, unknown>,
  state: Record<string, unknown>[] = [],
) {
  const body = {
    payload,
    controls: {},
    state,
    subscriber: { subscriberId: 'user-1' },
  };
  const timestamp = Date.now();
  const signature = createHmac('sha256', 'test-novu-secret')
    .update(`${timestamp}.${JSON.stringify(body)}`)
    .digest('hex');

  const response = await POST(
    new Request(
      `https://opendealbook.com/api/novu?action=execute&workflowId=${workflowId}&stepId=${stepId}`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'novu-signature': `t=${timestamp},v1=${signature}`,
        },
        body: JSON.stringify(body),
      },
    ),
  );

  return (await response.json()) as { outputs: Record<string, unknown> };
}

const discover = () =>
  new Request('https://opendealbook.com/api/novu?action=discover');

describe('Novu bridge route', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('refuses an unsigned request to run a workflow step', async () => {
    const { POST } = await importRoute('test-novu-secret');
    const response = await POST(
      new Request(
        'https://opendealbook.com/api/novu?action=execute&workflowId=lender_ask.answered&stepId=email',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            payload: { roomId: 'room', askId: 'ask', kind: 'ask' },
          }),
        },
      ),
    );

    expect(response.status).toBe(401);
  });

  it('refuses an unsigned request to list the workflows', async () => {
    const { GET } = await importRoute('test-novu-secret');

    expect((await GET(discover())).status).toBe(401);
  });

  it('loads without a Novu key and refuses every request', async () => {
    const { GET, POST } = await importRoute(undefined);

    expect((await GET(discover())).status).toBe(401);
    expect(
      (
        await POST(
          new Request('https://opendealbook.com/api/novu?action=execute', {
            method: 'POST',
            body: '{}',
          }),
        )
      ).status,
    ).toBe(401);
  });

  it('serves only the methods Novu calls', async () => {
    expect(Object.keys(await importRoute('test-novu-secret')).sort()).toEqual([
      'GET',
      'POST',
    ]);
  });

  it.each([
    {
      title: 'a team account by its slug',
      account: { slug: 'acme-capital' },
      link: 'https://opendealbook.com/home/acme-capital/deals/deal-1/lenders/room-1',
    },
  ])('links a room held by $title', async ({ account, link }) => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://opendealbook.com');
    roomRow.current = {
      name: 'First Harbor Bank',
      deal_id: 'deal-1',
      deal: { firm: { name: 'Acme Tooling' } },
      accounts: account,
    };
    const { POST } = await importRoute('test-novu-secret');
    const { outputs } = await executeSigned(
      POST,
      'lender_room.access_requested',
      'email',
      { roomId: 'room-1', email: 'banker@firstharbor.example' },
    );

    expect(outputs.body).toContain(`href="${link}"`);
  });

  it('names the counsel and the deal in a counsel message email to the team', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://opendealbook.com');
    roomRow.current = {
      deal_id: 'deal-1',
      side: 'buyer',
      author_user_id: 'counsel-1',
      deal: { code_name: 'Project Falcon', firm: { name: 'Acme Tooling' } },
      accounts: { slug: 'acme-capital' },
    };
    counselRow.current = { name: 'Bea Buyerlaw', email: 'bea@law.example' };
    const { POST } = await importRoute('test-novu-secret');
    const { outputs } = await executeSigned(POST, 'counsel-message', 'email', {
      messageId: 'message-1',
      audience: 'team',
    });

    expect(outputs.subject).toBe("New message from buyer's counsel");
    expect(outputs.body).toContain('Bea Buyerlaw');
    expect(outputs.body).toContain('Acme Tooling');
    expect(outputs.body).not.toContain('Project Falcon');
    expect(outputs.body).toContain(
      'href="https://opendealbook.com/home/acme-capital/deals/deal-1/parties#counsel-message-message-1"',
    );
  });

  it.each([
    ['buyer', 'Project Falcon', 'Project Falcon'],
    ['buyer', null, 'Acme Tooling'],
    ['seller', 'Project Falcon', 'Acme Tooling'],
  ])(
    "names the deal to %s's counsel with code name %s as %s in a counsel message email",
    async (side, codeName, shown) => {
      vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://opendealbook.com');
      roomRow.current = {
        deal_id: 'deal-1',
        side,
        author_user_id: 'manager-1',
        deal: { code_name: codeName, firm: { name: 'Acme Tooling' } },
        accounts: { slug: 'acme-capital' },
      };
      counselRow.current = null;
      const { POST } = await importRoute('test-novu-secret');
      const { outputs } = await executeSigned(
        POST,
        'counsel-message',
        'email',
        {
          messageId: 'message-1',
          audience: 'counsel',
        },
      );

      expect(outputs.body).toContain(`a message on ${shown}.`);
    },
  );

  it('tells an approver who submitted which update on the business name', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://opendealbook.com');
    roomRow.current = {
      subject: 'Rate lock',
      author_id: 'author-1',
      deal_id: 'deal-1',
      deal: { firm: { name: 'Acme Tooling' } },
      accounts: { slug: 'acme-capital' },
    };
    authorRow.current = { name: 'Avery Author' };
    const { POST } = await importRoute('test-novu-secret');
    const { outputs } = await executeSigned(
      POST,
      'deal-update-submitted',
      'email',
      { updateId: 'update-1' },
    );

    expect(outputs.subject).toBe(
      'Avery Author submitted an update on Acme Tooling for approval: Rate lock',
    );
    expect(outputs.body).toContain(
      'href="https://opendealbook.com/home/acme-capital/deals/deal-1#deal-update-update-1"',
    );
  });

  it.each([
    { setting: '1', window: { amount: 1, unit: 'minutes' } },
    { setting: undefined, window: { type: 'timed', cron: '0 22 * * *' } },
  ])(
    'batches the documents digest per LENDER_DIGEST_INTERVAL_MINUTES=$setting',
    async ({ setting, window }) => {
      const { POST } = await importRoute('test-novu-secret', setting);
      const { outputs } = await executeSigned(
        POST,
        'lender-room-documents',
        'daily-digest',
        { documentId: 'document-1', isNewVersion: false },
      );

      expect(outputs).toEqual(window);
    },
  );

  it('lists the FAQ entries the database still shows the person in the digest', async () => {
    sellerRooms.rows = [
      {
        id: 'room-1',
        deal: { code_name: 'Project Falcon', firm: { name: 'Acme Tooling' } },
      },
    ];
    rpcRows.current = {
      lender_visible_documents: [],
      lender_visible_faq_entries: [
        {
          entry_id: 'entry-1',
          question: 'What was 2025 EBITDA?',
          room_id: 'room-1',
          room_name: 'First Harbor Bank',
        },
      ],
    };
    const { POST } = await importRoute('test-novu-secret');
    const { outputs } = await executeSigned(
      POST,
      'lender-room-documents',
      'visible-documents',
      { kind: 'faq', entryId: 'entry-1', roomId: 'room-1' },
      [
        {
          stepId: 'daily-digest',
          outputs: {
            eventCount: 1,
            events: [
              {
                id: 'event-1',
                time: '2026-10-13T12:00:00.000Z',
                payload: { kind: 'faq', entryId: 'entry-1', roomId: 'room-1' },
              },
            ],
          },
          state: { status: 'completed' },
        },
      ],
    );

    expect(outputs).toEqual({
      checked: true,
      rooms: [
        {
          roomId: 'room-1',
          name: 'Project Falcon',
          items: [{ kind: 'faq', question: 'What was 2025 EBITDA?' }],
          moreCount: 0,
        },
      ],
    });
  });

  it('names the seller rooms the person still manages for their activity digest', async () => {
    sellerRooms.rows = [
      {
        id: 'seller-room-1',
        deal_id: 'deal-1',
        account_id: 'account-1',
        deal: { firm: { name: 'Acme Tooling' } },
        accounts: { slug: 'acme-capital' },
      },
      {
        id: 'seller-room-2',
        deal_id: 'deal-2',
        account_id: 'account-2',
        deal: { firm: { name: 'Elsewhere Supply' } },
        accounts: { slug: 'other' },
      },
    ];
    sellerRooms.managedAccounts = new Set(['account-1']);
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://opendealbook.com');
    const { POST } = await importRoute('test-novu-secret');
    const { outputs } = await executeSigned(
      POST,
      'seller-room-activity',
      'managed-rooms',
      { roomId: 'seller-room-1', line: 'Sam Seller uploaded lease.pdf' },
      [
        {
          stepId: 'daily-digest',
          outputs: {
            eventCount: 2,
            events: [
              {
                id: 'event-1',
                time: '2026-10-15T12:00:00.000Z',
                payload: {
                  roomId: 'seller-room-1',
                  line: 'Sam Seller uploaded lease.pdf',
                },
              },
              {
                id: 'event-2',
                time: '2026-10-15T12:00:00.000Z',
                payload: {
                  roomId: 'seller-room-2',
                  line: 'Pat Partner uploaded other.pdf',
                },
              },
            ],
          },
          state: { status: 'completed' },
        },
      ],
    );

    expect(outputs).toEqual({
      rooms: [
        {
          title: 'Acme Tooling',
          link: 'https://opendealbook.com/home/acme-capital/deals/deal-1',
          lines: ['Sam Seller uploaded lease.pdf'],
        },
      ],
    });
  });

  it("names the deals the person still manages for the buyer's counsel uploads digest", async () => {
    sellerRooms.rows = [
      {
        id: 'deal-1',
        account_id: 'account-1',
        firm: { name: 'Acme Tooling' },
        accounts: { slug: 'acme-capital' },
      },
      {
        id: 'deal-2',
        account_id: 'account-2',
        firm: { name: 'Elsewhere Supply' },
        accounts: { slug: 'other' },
      },
    ];
    sellerRooms.managedAccounts = new Set(['account-1']);
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://opendealbook.com');
    const { POST } = await importRoute('test-novu-secret');
    const { outputs } = await executeSigned(
      POST,
      'counsel-uploads',
      'managed-deals',
      { dealId: 'deal-1', line: 'Bea Buyerlaw uploaded redline.pdf' },
      [
        {
          stepId: 'daily-digest',
          outputs: {
            eventCount: 2,
            events: [
              {
                id: 'event-1',
                time: '2026-10-15T12:00:00.000Z',
                payload: {
                  dealId: 'deal-1',
                  line: 'Bea Buyerlaw uploaded redline.pdf',
                },
              },
              {
                id: 'event-2',
                time: '2026-10-15T12:00:00.000Z',
                payload: {
                  dealId: 'deal-2',
                  line: 'Cal Counsel uploaded other.pdf',
                },
              },
            ],
          },
          state: { status: 'completed' },
        },
      ],
    );

    expect(outputs).toEqual({
      deals: [
        {
          title: 'Acme Tooling',
          link: 'https://opendealbook.com/home/acme-capital/deals/deal-1',
          lines: ['Bea Buyerlaw uploaded redline.pdf'],
        },
      ],
    });
  });

  it('names what a seller digest may still show, labelling meetings by kind and day', async () => {
    sellerRooms.rows = [
      {
        id: 'seller-room-1',
        deal: { code_name: 'Project Falcon', firm: { name: 'Acme Tooling' } },
      },
    ];
    rpcRows.current = {
      seller_digest_items: [
        {
          kind: 'folder',
          item_id: 'folder-1',
          name: 'Financials',
          folder_id: null,
          scheduled_at: null,
          room_id: 'seller-room-1',
          team_name: 'Acme Partners',
        },
        {
          kind: 'meeting',
          item_id: 'meeting-1',
          name: 'weekly',
          folder_id: null,
          scheduled_at: '2026-10-01T10:00:00Z',
          room_id: 'seller-room-1',
          team_name: 'Acme Partners',
        },
      ],
    };
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://opendealbook.com');
    const { POST } = await importRoute('test-novu-secret');
    const event = (payload: Record<string, unknown>, index: number) => ({
      id: `event-${index}`,
      time: '2026-10-15T12:00:00.000Z',
      payload,
    });
    const { outputs } = await executeSigned(
      POST,
      'seller-room-shared',
      'visible-items',
      { kind: 'folder', roomId: 'seller-room-1', folderId: 'folder-1' },
      [
        {
          stepId: 'daily-digest',
          outputs: {
            eventCount: 2,
            events: [
              event(
                {
                  kind: 'folder',
                  roomId: 'seller-room-1',
                  folderId: 'folder-1',
                },
                1,
              ),
              event(
                {
                  kind: 'meeting',
                  roomId: 'seller-room-1',
                  meetingId: 'meeting-1',
                },
                2,
              ),
            ],
          },
          state: { status: 'completed' },
        },
      ],
    );

    expect(outputs).toEqual({
      rooms: [
        {
          title: 'Acme Tooling with Acme Partners',
          outsideName: 'Project Falcon',
          link: 'https://opendealbook.com/seller/rooms/seller-room-1',
          lines: [
            'New folder: Financials',
            'New meeting: Weekly meeting, Oct 1, 2026',
          ],
        },
      ],
    });
  });
});
