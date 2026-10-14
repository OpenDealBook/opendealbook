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

function makeClient(members: string[], dealName: string | null) {
  return {
    from(table: string) {
      if (table === 'deal') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { description: dealName }, error: null }),
            }),
          }),
        };
      }
      if (table === 'notification_preference') {
        return preferenceTable(null);
      }
      return {
        select: () => ({
          eq: async () => ({
            data: members.map((user_id) => ({ user_id })),
            error: null,
          }),
        }),
      };
    },
  };
}

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
  it('triggers the mapped Novu workflow for every account member with a deal payload', async () => {
    process.env.NOVU_API_KEY = 'secret';
    process.env.NOVU_API_URL = 'https://novu.test';
    const trigger = vi.fn().mockResolvedValue(undefined);
    state.novu = { trigger, subscribers: { identify: vi.fn() } };
    state.client = makeClient(['member-1', 'member-2'], 'Acme Tax');

    await notifyDealEvent(input);

    expect(trigger).toHaveBeenCalledTimes(2);
    expect(trigger).toHaveBeenCalledWith('deal.offer_submitted', {
      to: { subscriberId: 'member-1' },
      payload: {
        dealId: 'deal-1',
        dealName: 'Acme Tax',
        actor: 'user-actor',
        event: 'offer.submitted',
      },
    });
    expect(trigger).toHaveBeenCalledWith('deal.offer_submitted', {
      to: { subscriberId: 'member-2' },
      payload: {
        dealId: 'deal-1',
        dealName: 'Acme Tax',
        actor: 'user-actor',
        event: 'offer.submitted',
      },
    });
  });

  it('is a no-op that never builds a Novu client when Novu is not configured', async () => {
    state.client = makeClient(['member-1'], 'Acme Tax');

    await notifyDealEvent(input);

    expect(state.createNovuCalls).toBe(0);
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
    state.client = makeClient(['member-1', 'member-2'], 'Acme Tax');

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

const lenderOne = { room_id: 'room-a', user_id: 'lender-1', email: 'one@bank.test' };
const lenderTwo = { room_id: 'room-a', user_id: 'lender-2', email: 'two@bank.test' };

function makeLenderClient(seed: {
  payload: unknown;
  recipients: Recipient[];
  preferenceError?: Error;
}) {
  return {
    from: (table: string) =>
      table === 'notification_preference'
        ? preferenceTable(seed.preferenceError ?? null)
        : {
            select: () => ({
              eq: (_column: string, globalSeq: number) => ({
                maybeSingle: () => ({
                  throwOnError: async () => ({
                    data:
                      globalSeq === 42
                        ? { aggregate_id: 'doc-1', payload: seed.payload }
                        : null,
                  }),
                }),
              }),
            }),
          },
    rpc: (name: string, args: { document_id: string }) => ({
      throwOnError: async () => ({
        data:
          name === 'lender_document_recipients' && args.document_id === 'doc-1'
            ? seed.recipients
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
      trigger.mock.calls.map(([, data]) => [data.to.subscriberId, data.payload.roomId]),
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
    state.client = makeLenderClient({ payload: { version: 1 }, recipients: [] });

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

    await expect(notifyDealEvent(documentInput)).rejects.toThrow('database down');
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
