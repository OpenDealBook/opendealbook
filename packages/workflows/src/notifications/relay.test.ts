import { afterEach, describe, expect, it, vi } from 'vitest';

import { notifyDealEvent } from './relay';

const state = vi.hoisted(() => ({
  client: null as unknown,
  novu: null as unknown,
  createNovuCalls: 0,
}));

vi.mock('@odb/supabase/admin', () => ({
  getSupabaseServerAdminClient: () => state.client,
}));

vi.mock('@odb/notifications/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@odb/notifications/server')>()),
  createNovuClient: () => {
    state.createNovuCalls += 1;
    return state.novu;
  },
}));

function preferenceTable(error: Error | null) {
  return {
    select: () => ({
      eq: () => ({ eq: async () => ({ data: [], error }) }),
    }),
  };
}

interface TeamMember {
  userId: string;
  managesDeals: boolean;
}

const acmeDeal = {
  firm: { name: 'Acme Tax' },
  accounts: { slug: 'acme-capital' },
};

function makeClient(
  members: TeamMember[],
  deal: {
    firm: { name: string };
    accounts: { slug: string };
  } = acmeDeal,
  resolution = 'won',
) {
  const notifications: Record<string, unknown>[] = [];
  const client = {
    notifications,
    from(table: string) {
      if (table === 'deal') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => ({
                throwOnError: async () => ({ data: deal }),
              }),
            }),
          }),
        };
      }
      if (table === 'deal_event') {
        const found = () => ({
          throwOnError: async () => ({
            data: { payload: { resolution }, aggregate_id: 'offer-1' },
          }),
        });
        return {
          select: () => ({
            eq: () => ({ single: found, maybeSingle: found }),
          }),
        };
      }
      if (table === 'notifications') {
        return {
          upsert: (rows: Record<string, unknown>[]) => ({
            throwOnError: async () => {
              notifications.push(...rows);
            },
          }),
        };
      }
      if (table === 'notification_preference') {
        return preferenceTable(null);
      }
      if (table === 'accounts') {
        return {
          select: () => ({
            eq: () => ({
              single: () => ({
                throwOnError: async () => ({
                  data: {
                    primary_owner_user_id: members.find((m) => m.managesDeals)
                      ?.userId,
                  },
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'role_permissions') {
        return {
          select: () => ({
            eq: () => ({
              throwOnError: async () => ({ data: [{ role: 'manager' }] }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            throwOnError: async () => ({
              data: members.map(({ userId, managesDeals }) => ({
                user_id: userId,
                account_role: managesDeals ? 'manager' : 'viewer',
              })),
            }),
          }),
        }),
      };
    },
  };
  return client;
}

const managers = (...ids: string[]) =>
  ids.map((userId) => ({ userId, managesDeals: true }));

const input = {
  globalSeq: 1,
  workflowId: 'deal.offer_submitted',
  dealId: 'deal-1',
  accountId: 'acct-1',
  actorRef: 'user-actor',
  eventType: 'offer.submitted',
};

afterEach(() => {
  vi.restoreAllMocks();
  state.client = null;
  state.novu = null;
  state.createNovuCalls = 0;
  delete process.env.NOVU_API_KEY;
  delete process.env.NOVU_API_URL;
});

describe('notifyDealEvent', () => {
  it('triggers the mapped Novu workflow for each deal manager with the deal, link and business name, never the description', async () => {
    process.env.NOVU_API_KEY = 'secret';
    process.env.NOVU_API_URL = 'https://novu.test';
    const trigger = vi.fn().mockResolvedValue(undefined);
    state.novu = { trigger, subscribers: { identify: vi.fn() } };
    state.client = makeClient(managers('member-1', 'member-2'));

    await notifyDealEvent(input);

    const payload = {
      dealId: 'deal-1',
      dealName: 'Acme Tax',
      firmName: 'Acme Tax',
      path: '/home/acme-capital/deals/deal-1/financials#offer-offer-1',
      actor: 'user-actor',
      event: 'offer.submitted',
    };
    expect(trigger).toHaveBeenCalledTimes(2);
    expect(trigger).toHaveBeenCalledWith('deal.offer_submitted', {
      to: { subscriberId: 'member-1' },
      payload,
    });
    expect(trigger).toHaveBeenCalledWith('deal.offer_submitted', {
      to: { subscriberId: 'member-2' },
      payload,
    });
  });

  it('notifies only members who can manage deals, by email and in the app', async () => {
    process.env.NOVU_API_KEY = 'secret';
    process.env.NOVU_API_URL = 'https://novu.test';
    const trigger = vi.fn().mockResolvedValue(undefined);
    state.novu = { trigger, subscribers: { identify: vi.fn() } };
    const client = makeClient([
      { userId: 'manager', managesDeals: true },
      { userId: 'viewer', managesDeals: false },
    ]);
    state.client = client;

    await notifyDealEvent({
      ...input,
      workflowId: 'deal.offer_accepted',
      eventType: 'offer.accepted',
    });

    expect(peopleTold(trigger)).toEqual(['manager']);
    expect(client.notifications).toEqual([
      {
        account_id: 'acct-1',
        recipient_user_id: 'manager',
        deal_id: 'deal-1',
        type: 'info',
        body: 'Offer accepted on Acme Tax',
        link: '/home/acme-capital/deals/deal-1/financials#offer-offer-1',
        dedupe_key: 'deal_event:1:manager',
      },
    ]);
  });

  it.each([
    ['deal.loi_accepted', 'LOI accepted on Acme Tax'],
    ['deal.apa_accepted', 'APA accepted on Acme Tax'],
    ['deal.offer_submitted', 'Offer submitted on Acme Tax'],
  ])('writes the in-app notice for %s as "%s"', async (workflowId, body) => {
    process.env.NOVU_API_KEY = 'secret';
    process.env.NOVU_API_URL = 'https://novu.test';
    state.novu = { trigger: vi.fn(), subscribers: { identify: vi.fn() } };
    const client = makeClient(managers('manager'));
    state.client = client;

    await notifyDealEvent({ ...input, workflowId });

    expect(client.notifications).toMatchObject([{ body }]);
  });

  it.each([
    ['won', 'closed', 'Acme Tax closed'],
    ['lost', 'lost', 'Acme Tax was marked lost'],
  ])(
    'tells managers a %s resolution as outcome %s: "%s"',
    async (resolution, outcome, body) => {
      process.env.NOVU_API_KEY = 'secret';
      process.env.NOVU_API_URL = 'https://novu.test';
      const trigger = vi.fn().mockResolvedValue(undefined);
      state.novu = { trigger, subscribers: { identify: vi.fn() } };
      const client = makeClient(managers('manager'), acmeDeal, resolution);
      state.client = client;

      await notifyDealEvent({
        ...input,
        workflowId: 'deal.resolved',
        eventType: 'deal.resolved',
      });

      expect(trigger.mock.calls[0]?.[1].payload.outcome).toBe(outcome);
      expect(client.notifications).toMatchObject([{ body }]);
    },
  );

  it('is a no-op that never builds a Novu client when Novu is not configured', async () => {
    state.client = makeClient(managers('member-1'));

    await notifyDealEvent(input);

    expect(state.createNovuCalls).toBe(0);
  });

  it('still writes the in-app notice to deal managers when Novu is not configured', async () => {
    const client = makeClient(managers('manager'));
    state.client = client;

    await notifyDealEvent(input);

    expect(client.notifications).toMatchObject([
      { recipient_user_id: 'manager', body: 'Offer submitted on Acme Tax' },
    ]);
  });

  it('logs the missing Novu configuration once per process, not once per event', async () => {
    vi.resetModules();
    const { notifyDealEvent: freshNotifyDealEvent } = await import('./relay');
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    state.client = makeClient(managers('member-1'));

    await freshNotifyDealEvent(input);
    await freshNotifyDealEvent({ ...input, globalSeq: 2, dealId: 'deal-2' });
    await freshNotifyDealEvent({ ...input, globalSeq: 3, dealId: 'deal-3' });

    expect(info).toHaveBeenCalledTimes(1);
    expect(info.mock.calls[0]?.[0]).toContain('Novu not configured');
  });

  it('does not break when a Novu trigger throws; it warns and continues to the next member', async () => {
    process.env.NOVU_API_KEY = 'secret';
    process.env.NOVU_API_URL = 'https://novu.test';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const trigger = vi
      .fn()
      .mockRejectedValueOnce(new Error('novu down'))
      .mockResolvedValueOnce(undefined);
    state.novu = { trigger, subscribers: { identify: vi.fn() } };
    state.client = makeClient(managers('member-1', 'member-2'));

    await expect(notifyDealEvent(input)).resolves.toBeUndefined();

    expect(trigger).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalled();
  });
});

interface Recipient {
  room_id: string;
  user_id: string;
  email: string;
}

const lenderOne = {
  room_id: 'room-a',
  user_id: 'lender-1',
  email: 'one@bank.test',
};
const lenderTwo = {
  room_id: 'room-a',
  user_id: 'lender-2',
  email: 'two@bank.test',
};

const addedDocument = {
  folder_id: '9f1c2b3a-4d5e-4f60-8a71-b2c3d4e5f601',
  name: 'Tax returns.pdf',
  storage_path: 'deal/deal-1/doc-1',
};

function makeLenderClient(seed: {
  payload: unknown;
  recipients: Recipient[];
  sellers?: Recipient[];
  timezones?: Record<string, string>;
  preferenceError?: Error;
}) {
  return {
    from: (table: string) =>
      table === 'notification_preference'
        ? preferenceTable(seed.preferenceError ?? null)
        : table === 'accounts'
          ? {
              select: () => ({
                in: (_column: string, ids: string[]) => ({
                  throwOnError: async () => ({
                    data: ids.map((id) => ({
                      id,
                      timezone: seed.timezones?.[id] ?? null,
                    })),
                  }),
                }),
              }),
            }
          : table === 'seller_counsel_folder'
            ? {
                select: () => ({
                  eq: () => ({
                    maybeSingle: () => ({
                      throwOnError: async () => ({ data: null }),
                    }),
                  }),
                }),
              }
            : table === 'dr_folder'
              ? {
                  select: () => ({
                    eq: () => ({ throwOnError: async () => ({ data: [] }) }),
                  }),
                }
              : {
                  select: () => ({
                    eq: (_column: string, globalSeq: number) => ({
                      maybeSingle: () => ({
                        throwOnError: async () => ({
                          data:
                            globalSeq === 42
                              ? {
                                  aggregate_id: 'doc-1',
                                  payload: {
                                    ...addedDocument,
                                    ...(seed.payload as object),
                                  },
                                }
                              : null,
                        }),
                      }),
                    }),
                  }),
                },
    rpc: (name: string, args: { document_id: string }) => ({
      throwOnError: async () => ({
        data:
          args.document_id !== 'doc-1'
            ? []
            : name === 'lender_document_recipients'
              ? seed.recipients
              : name === 'seller_document_recipients'
                ? (seed.sellers ?? [])
                : [],
      }),
    }),
  };
}

const documentInput = {
  globalSeq: 42,
  workflowId: 'lender-room-documents',
  dealId: 'deal-1',
  accountId: 'acct-1',
  actorRef: 'user-internal' as string | null,
  eventType: 'dr_document.added',
};

function configureNovu() {
  process.env.NOVU_API_KEY = 'secret';
  process.env.NOVU_API_URL = 'https://novu.test';
  const trigger = vi.fn().mockResolvedValue(undefined);
  state.novu = { trigger, subscribers: { identify: vi.fn() } };
  return trigger;
}

function peopleTold(trigger: ReturnType<typeof configureNovu>) {
  return trigger.mock.calls.map(([, data]) => data.to.subscriberId);
}

async function newVersionFlagFor(payload: unknown) {
  const trigger = configureNovu();
  state.client = makeLenderClient({ payload, recipients: [lenderOne] });

  await notifyDealEvent(documentInput);

  return trigger.mock.calls.map(([, data]) => data.payload.isNewVersion);
}

describe('notifyDealEvent for a document added to a data room', () => {
  it('triggers the lender documents workflow for a person with the room, deal, document, and a stable identity', async () => {
    const trigger = configureNovu();
    state.client = makeLenderClient({
      payload: { version: 1 },
      recipients: [lenderOne],
    });

    await notifyDealEvent(documentInput);

    expect(trigger.mock.calls).toEqual([
      [
        'lender-room-documents',
        {
          to: { subscriberId: 'lender-1', email: 'one@bank.test' },
          payload: {
            roomId: 'room-a',
            dealId: 'deal-1',
            documentId: 'doc-1',
            isNewVersion: false,
          },
          transactionId: 'lender-room-documents:42:lender-1',
        },
      ],
    ]);
  });

  it('tells every room member about a document our team added', async () => {
    const trigger = configureNovu();
    state.client = makeLenderClient({
      payload: { version: 1 },
      recipients: [lenderOne, lenderTwo],
    });

    await notifyDealEvent(documentInput);

    expect(peopleTold(trigger)).toEqual(['lender-1', 'lender-2']);
  });

  it('tells a person in several rooms once, naming the first room by id', async () => {
    const trigger = configureNovu();
    state.client = makeLenderClient({
      payload: { version: 1 },
      recipients: [{ ...lenderOne, room_id: 'room-b' }, lenderOne],
    });

    await notifyDealEvent(documentInput);

    expect(
      trigger.mock.calls.map(([, data]) => [
        data.to.subscriberId,
        data.payload.roomId,
      ]),
    ).toEqual([['lender-1', 'room-a']]);
  });

  it('says the document is a new version when its version is above 1', async () => {
    expect(await newVersionFlagFor({ version: 2 })).toEqual([true]);
  });

  it('reads a version written as a numeric string', async () => {
    expect(await newVersionFlagFor({ version: '2' })).toEqual([true]);
  });

  it('treats a null version as a new file', async () => {
    expect(await newVersionFlagFor({ version: null })).toEqual([false]);
  });

  it('treats a missing version as a new file', async () => {
    expect(await newVersionFlagFor({})).toEqual([false]);
  });

  it('tells nobody when no lender person can see the document', async () => {
    const trigger = configureNovu();
    state.client = makeLenderClient({
      payload: { version: 1 },
      recipients: [],
    });

    await notifyDealEvent(documentInput);

    expect(trigger).not.toHaveBeenCalled();
  });

  it('tells the room colleagues of a lender who uploaded through the service actor, and not that lender', async () => {
    const trigger = configureNovu();
    state.client = makeLenderClient({
      payload: { version: 1, uploaded_by: 'lender-1' },
      recipients: [lenderOne, lenderTwo],
    });

    await notifyDealEvent({ ...documentInput, actorRef: null });

    expect(peopleTold(trigger)).toEqual(['lender-2']);
  });

  it('does not tell the event actor when the event records no uploader', async () => {
    const trigger = configureNovu();
    state.client = makeLenderClient({
      payload: { version: 1 },
      recipients: [lenderOne, lenderTwo],
    });

    await notifyDealEvent({ ...documentInput, actorRef: 'lender-1' });

    expect(peopleTold(trigger)).toEqual(['lender-2']);
  });

  it('goes on to the next person when Novu fails for one of them', async () => {
    const trigger = configureNovu();
    trigger.mockRejectedValueOnce(new Error('novu down'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    state.client = makeLenderClient({
      payload: { version: 1 },
      recipients: [lenderOne, lenderTwo],
    });

    await expect(notifyDealEvent(documentInput)).resolves.toBeUndefined();

    expect(peopleTold(trigger)).toEqual(['lender-1', 'lender-2']);
  });

  it('warns, naming the person, when Novu fails for them', async () => {
    const trigger = configureNovu();
    trigger.mockRejectedValueOnce(new Error('novu down'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    state.client = makeLenderClient({
      payload: { version: 1 },
      recipients: [lenderOne],
    });

    await notifyDealEvent(documentInput);

    expect(warn.mock.calls.map(([message]) => message)).toEqual([
      expect.stringContaining('lender-1'),
    ]);
  });

  it('rejects, so the activity retries, when reading a person preferences fails', async () => {
    configureNovu();
    state.client = makeLenderClient({
      payload: { version: 1 },
      recipients: [lenderOne],
      preferenceError: new Error('database down'),
    });

    await expect(notifyDealEvent(documentInput)).rejects.toThrow(
      'database down',
    );
  });

  it('logs an error naming the event sequence and sends nothing when the event row is missing', async () => {
    const trigger = configureNovu();
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    state.client = makeLenderClient({
      payload: { version: 1 },
      recipients: [lenderOne],
    });

    await expect(
      notifyDealEvent({ ...documentInput, globalSeq: 43 }),
    ).resolves.toBeUndefined();

    expect(logged.mock.calls.map(([message]) => message)).toEqual([
      expect.stringContaining('43'),
    ]);
    expect(trigger).not.toHaveBeenCalled();
  });

  it('logs an error naming the event sequence and sends nothing when the payload cannot be read', async () => {
    const trigger = configureNovu();
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    state.client = makeLenderClient({
      payload: { version: 'second' },
      recipients: [lenderOne],
    });

    await expect(notifyDealEvent(documentInput)).resolves.toBeUndefined();

    expect(logged.mock.calls.map(([message]) => message)).toEqual([
      expect.stringContaining('42'),
    ]);
    expect(trigger).not.toHaveBeenCalled();
  });

  it('sends nothing and does not throw when Novu is not configured', async () => {
    const trigger = vi.fn();
    state.novu = { trigger, subscribers: { identify: vi.fn() } };
    state.client = makeLenderClient({
      payload: { version: 1 },
      recipients: [lenderOne],
    });

    await expect(notifyDealEvent(documentInput)).resolves.toBeUndefined();

    expect(trigger).not.toHaveBeenCalled();
  });
});

describe('notifyDealEvent for a document added to a folder a seller room shows', () => {
  const sellerOne = {
    room_id: 'seller-room-a',
    user_id: 'seller-1',
    email: 'one@seller.test',
  };
  const sellerTwo = {
    room_id: 'seller-room-a',
    user_id: 'seller-2',
    email: 'two@seller.test',
  };
  const documentPayload = {
    kind: 'document',
    roomId: 'seller-room-a',
    documentId: 'doc-1',
    isNewVersion: true,
  };

  it('queues the file for each seller daily digest, in each room that shows it', async () => {
    const trigger = configureNovu();
    state.client = makeLenderClient({
      payload: { version: 2 },
      recipients: [],
      sellers: [sellerOne, sellerTwo],
    });

    await notifyDealEvent(documentInput);

    expect(trigger.mock.calls).toEqual([
      [
        'seller-room-shared',
        {
          to: { subscriberId: 'seller-1', email: 'one@seller.test' },
          payload: documentPayload,
          transactionId: 'seller-room-shared:42:seller-room-a:seller-1',
        },
      ],
      [
        'seller-room-shared',
        {
          to: { subscriberId: 'seller-2', email: 'two@seller.test' },
          payload: documentPayload,
          transactionId: 'seller-room-shared:42:seller-room-a:seller-2',
        },
      ],
    ]);
  });

  it("carries each seller's time zone so their digest goes out in their evening", async () => {
    const trigger = configureNovu();
    state.client = makeLenderClient({
      payload: { version: 2 },
      recipients: [],
      sellers: [sellerOne, sellerTwo],
      timezones: { 'seller-1': 'America/Denver' },
    });

    await notifyDealEvent(documentInput);

    expect(trigger.mock.calls.map(([, data]) => data.payload)).toEqual([
      { ...documentPayload, timezone: 'America/Denver' },
      documentPayload,
    ]);
  });

  it('does not tell the person who added the file', async () => {
    const trigger = configureNovu();
    state.client = makeLenderClient({
      payload: { version: 1, uploaded_by: 'seller-1' },
      recipients: [],
      sellers: [sellerOne, sellerTwo],
    });

    await notifyDealEvent(documentInput);

    expect(peopleTold(trigger)).toEqual(['seller-2']);
  });
});
