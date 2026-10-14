import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type { ActionResult } from '../actions/refusal';
import { unwrap } from '../actions/test-support/unwrap';
import {
  type Person,
  admin,
  provisionPerson,
  removeEverythingSeeded,
  seedDocument,
  seedFolder,
  seedPersonalDeal,
  seedRoom,
  seedTeamDeal,
} from './integration-harness';

interface SentNotification {
  eventType: string;
  recipientUserId: string;
  email: string | undefined;
  payload: unknown;
}

const harness = vi.hoisted(() => ({
  client: null as unknown,
  user: null as unknown,
  sent: [] as SentNotification[],
  novuIsDown: false,
  recipientLookupIsDown: false,
}));

vi.mock('@odb/supabase/admin', async (importOriginal) => {
  const original = await importOriginal<typeof import('@odb/supabase/admin')>();

  return {
    ...original,
    getSupabaseServerAdminClient: () =>
      new Proxy(original.getSupabaseServerAdminClient(), {
        get(target, property) {
          if (property !== 'from') {
            return Reflect.get(target, property, target);
          }

          return (table: never) => {
            if (
              harness.recipientLookupIsDown &&
              ['accounts_memberships', 'lender_room_member'].includes(table)
            ) {
              throw new Error('The recipient lookup is down');
            }

            return target.from(table);
          };
        },
      }),
  };
});

vi.mock('@odb/next/actions', () => ({
  enhanceAction:
    (
      fn: (input: unknown, user: unknown) => unknown,
      config: { schema: { parse: (input: unknown) => unknown } },
    ) =>
    async (input: unknown) =>
      fn(config.schema.parse(input), harness.user),
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => harness.client,
}));

vi.mock('@odb/notifications/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@odb/notifications/server')>()),
  createNovuClient: () => {
    if (!process.env.NOVU_API_KEY || !process.env.NOVU_API_URL) {
      throw new Error('Missing required environment variable: NOVU_API_KEY');
    }

    return {
      trigger: async (
        eventType: string,
        data: {
          to: { subscriberId: string; email?: string };
          payload: unknown;
        },
      ) => {
        if (harness.novuIsDown) {
          throw new Error('Novu is down');
        }

        harness.sent.push({
          eventType,
          recipientUserId: data.to.subscriberId,
          email: data.to.email,
          payload: data.payload,
        });
      },
    };
  },
}));

import {
  closeAskAsInternal,
  promoteAskFile,
  replyToAskAsInternal,
} from './internal-actions';
import {
  closeAskAsLender,
  editAsk,
  openAsk,
  replyToAskAsLender,
  withdrawAsk,
} from './lender-actions';
import { getAsk, listAsks } from './queries';

const NOT_A_MEMBER = 'You are not a member of this lender room';
const NOT_SHOWN = 'That document is not in this lender room';
const EMPTY_REPLY = 'A reply needs a message or a file';
const NOT_IN_ROOM_FOLDER = "That file is not in the lender room's own folder";
const NOT_IN_PACKAGE = 'That folder is not in the lender package';
const CHANGED = 'This changed while you were working. Reload and try again.';
const REQUEST_NOT_FOUND = 'That request was not found';
const DEAL_TEAM_ONLY = 'Only the deal team can do that';
const TOO_LATE_TO_EDIT =
  'You can no longer edit this request because the deal team has responded';

type Action<Output> = (
  data: Record<string, unknown>,
) => Promise<ActionResult<Output>>;

function as<Output = void>(person: Person, action: unknown) {
  return (data: Record<string, unknown>) => {
    harness.client = person.client;
    harness.user = { id: person.userId };
    return unwrap((action as Action<Output>)(data));
  };
}

async function sentDuring(run: () => Promise<unknown>) {
  harness.sent.length = 0;
  await run();
  return [...harness.sent];
}

async function askRow(askId: string) {
  const { data } = await admin
    .from('lender_ask')
    .select('*')
    .eq('id', askId)
    .single()
    .throwOnError();
  return data;
}

async function messagesOf(askId: string) {
  const { data } = await admin
    .from('lender_ask_message')
    .select('author_user_id, side, body')
    .eq('ask_id', askId)
    .order('created_at')
    .throwOnError();
  return data;
}

async function filesOf(askId: string) {
  const { data } = await admin
    .from('lender_ask_file')
    .select('id, dr_document_id, role, added_by')
    .eq('ask_id', askId)
    .order('created_at')
    .throwOnError();
  return data;
}

async function documentsIn(folderId: string) {
  const { data } = await admin
    .from('dr_document')
    .select('id, name, storage_path, version')
    .eq('folder_id', folderId)
    .order('version')
    .throwOnError();
  return data;
}

function configureNovu() {
  process.env.NOVU_API_KEY = 'test-key';
  process.env.NOVU_API_URL = 'http://novu.test';
}

type Room = { roomId: string; privateFolderId: string };

let us: Person;
let colleague: Person;
let lenderA: Person;
let lenderA2: Person;
let lenderB: Person;

let deal: { accountId: string; dealId: string };
let masterFolderId: string;
let roomA: Room;
let roomB: Room;
let masterDocumentId: string;
let roomADocumentId: string;
let roomBDocumentId: string;
let unsharedDocumentId: string;

beforeAll(async () => {
  configureNovu();

  [us, colleague, lenderA, lenderA2, lenderB] = await Promise.all([
    provisionPerson(),
    provisionPerson(),
    provisionPerson(),
    provisionPerson(),
    provisionPerson(),
  ]);

  deal = await seedTeamDeal(us, colleague);

  masterFolderId = await seedFolder(deal, 'Lender package');
  await admin
    .from('lender_package')
    .insert({
      deal_id: deal.dealId,
      account_id: deal.accountId,
      master_folder_id: masterFolderId,
    })
    .throwOnError();

  roomA = await seedRoom(deal, 'Bank A', [lenderA, lenderA2]);
  roomB = await seedRoom(deal, 'Bank B', [lenderB]);

  const unsharedFolderId = await seedFolder(deal, 'Diligence');
  masterDocumentId = await seedDocument(deal, masterFolderId, 'teaser.pdf');
  roomADocumentId = await seedDocument(
    deal,
    roomA.privateFolderId,
    'bank-a-checklist.pdf',
  );
  roomBDocumentId = await seedDocument(
    deal,
    roomB.privateFolderId,
    'bank-b-checklist.pdf',
  );
  unsharedDocumentId = await seedDocument(deal, unsharedFolderId, 'qoe.pdf');
}, 60_000);

beforeEach(() => {
  harness.sent.length = 0;
});

afterEach(() => {
  configureNovu();
});

afterAll(removeEverythingSeeded);

function openIn(room: Room, lender: Person, documentIds?: string[]) {
  return as<string>(
    lender,
    openAsk,
  )({
    roomId: room.roomId,
    title: 'Trailing twelve months',
    body: 'Please share the TTM P&L.',
    documentIds,
  });
}

function openInRoomA(documentIds?: string[]) {
  return openIn(roomA, lenderA, documentIds);
}

describe('a lender opening an ask with attachments', () => {
  let askId: string;
  let sent: SentNotification[];

  beforeAll(async () => {
    sent = await sentDuring(async () => {
      askId = await openInRoomA([masterDocumentId, roomADocumentId]);
    });
  });

  it('records an open ask from that lender', async () => {
    expect(await askRow(askId)).toMatchObject({
      room_id: roomA.roomId,
      account_id: deal.accountId,
      kind: 'ask',
      title: 'Trailing twelve months',
      body: 'Please share the TTM P&L.',
      status: 'open',
      first_response_at: null,
      created_by: lenderA.userId,
    });
  });

  it('files each document as an attachment added by that lender', async () => {
    const files = (await filesOf(askId)).map(({ id: _id, ...file }) => file);

    expect(files).toHaveLength(2);
    expect(files).toEqual(
      expect.arrayContaining([
        {
          dr_document_id: masterDocumentId,
          role: 'attachment',
          added_by: lenderA.userId,
        },
        {
          dr_document_id: roomADocumentId,
          role: 'attachment',
          added_by: lenderA.userId,
        },
      ]),
    );
  });

  it('tells every member of our account once, owner included', () => {
    const payload = { roomId: roomA.roomId, askId, kind: 'ask' };

    expect(sent).toHaveLength(2);
    expect(sent).toEqual(
      expect.arrayContaining([
        {
          eventType: 'lender_ask.opened',
          recipientUserId: us.userId,
          email: us.email,
          payload,
        },
        {
          eventType: 'lender_ask.opened',
          recipientUserId: colleague.userId,
          email: colleague.email,
          payload,
        },
      ]),
    );
  });
});

describe('opening an ask', () => {
  it('needs no body', async () => {
    const askId = await as<string>(
      lenderA,
      openAsk,
    )({
      roomId: roomA.roomId,
      title: 'Call me',
    });

    expect(await askRow(askId)).toMatchObject({ title: 'Call me', body: null });
  });

  it.each([
    ['empty', ''],
    ['only spaces', '   '],
  ])('refuses a title that is %s', async (_name, title) => {
    await expect(
      as(lenderA, openAsk)({ roomId: roomA.roomId, title, body: 'Hi' }),
    ).rejects.toThrow('An ask needs a title');
  });

  it('trims the title', async () => {
    const askId = await as<string>(
      lenderA,
      openAsk,
    )({
      roomId: roomA.roomId,
      title: '  Call me  ',
    });

    expect((await askRow(askId)).title).toBe('Call me');
  });

  it.each([
    ['in another room', () => roomBDocumentId],
    ['outside the lender package', () => unsharedDocumentId],
  ])('refuses a document %s', async (_name, documentId) => {
    await expect(openInRoomA([documentId()])).rejects.toThrow(NOT_SHOWN);
  });

  it('opens nothing and tells nobody when a document is refused', async () => {
    const before = await listAsks(us.client, roomA.roomId);

    const sent = await sentDuring(() =>
      openInRoomA([roomBDocumentId]).catch(() => undefined),
    );

    expect(await listAsks(us.client, roomA.roomId)).toHaveLength(before.length);
    expect(sent).toEqual([]);
  });
});

describe('a lender in room A', () => {
  let theirAskId: string;

  beforeAll(async () => {
    theirAskId = await openIn(roomB, lenderB);
  });

  it.each([
    [
      'open an ask in room B',
      openAsk,
      () => ({ roomId: roomB.roomId, title: 'Intruder' }),
    ],
    [
      'reply to room B’s ask',
      replyToAskAsLender,
      () => ({ askId: theirAskId, body: 'Hello' }),
    ],
    [
      'edit room B’s ask',
      editAsk,
      () => ({ askId: theirAskId, title: 'Mine', body: 'Now' }),
    ],
    ['withdraw room B’s ask', withdrawAsk, () => ({ askId: theirAskId })],
    ['close room B’s ask', closeAskAsLender, () => ({ askId: theirAskId })],
  ])('cannot %s', async (_name, action, input) => {
    await expect(as(lenderA, action)(input())).rejects.toThrow(
      action === openAsk ? NOT_A_MEMBER : REQUEST_NOT_FOUND,
    );
  });

  it('is told the same for an ask that does not exist', async () => {
    await expect(
      as(
        lenderA,
        replyToAskAsLender,
      )({
        askId: crypto.randomUUID(),
        body: 'Hello',
      }),
    ).rejects.toThrow(REQUEST_NOT_FOUND);
  });

  it('leaves room B’s ask as it was after those attempts', async () => {
    expect(await askRow(theirAskId)).toMatchObject({
      title: 'Trailing twelve months',
      body: 'Please share the TTM P&L.',
      status: 'open',
    });
    expect(await messagesOf(theirAskId)).toEqual([]);
  });

  it('reads nothing when listing room B’s asks', async () => {
    expect(await listAsks(lenderA.client, roomB.roomId)).toEqual([]);
  });
});

describe.each([
  [
    'a closed room',
    (room: Room) =>
      admin
        .from('lender_room')
        .update({ closed_at: new Date().toISOString() })
        .eq('id', room.roomId)
        .throwOnError(),
  ],
  [
    'an expired room',
    (room: Room) =>
      admin
        .from('lender_room')
        .update({ expires_at: '2020-01-01T00:00:00.000Z' })
        .eq('id', room.roomId)
        .throwOnError(),
  ],
  [
    'a room the lender was removed from',
    (room: Room) =>
      admin
        .from('lender_room_member')
        .delete()
        .eq('room_id', room.roomId)
        .eq('user_id', lenderA.userId)
        .throwOnError(),
  ],
])('in %s', (_name, endAccess) => {
  let room: Room;
  let askId: string;

  beforeAll(async () => {
    room = await seedRoom(deal, 'Bank gone', [lenderA]);
    askId = await openIn(room, lenderA);
    await endAccess(room);
  });

  it.each([
    ['open an ask', openAsk, () => ({ roomId: room.roomId, title: 'Late' })],
    ['reply', replyToAskAsLender, () => ({ askId, body: 'Hello' })],
    ['edit', editAsk, () => ({ askId, title: 'New', body: 'New' })],
    ['withdraw', withdrawAsk, () => ({ askId })],
    ['close', closeAskAsLender, () => ({ askId })],
  ])('the lender cannot %s', async (_action, action, input) => {
    await expect(as(lenderA, action)(input())).rejects.toThrow(
      action === openAsk ? NOT_A_MEMBER : REQUEST_NOT_FOUND,
    );
  });
});

describe('a lender using our side of an ask', () => {
  let askId: string;

  beforeAll(async () => {
    askId = await openInRoomA();
  });

  it('cannot reply as us', async () => {
    await expect(
      as(lenderA, replyToAskAsInternal)({ askId, body: 'Done' }),
    ).rejects.toThrow(DEAL_TEAM_ONLY);
  });

  it('cannot close as us', async () => {
    await expect(as(lenderA, closeAskAsInternal)({ askId })).rejects.toThrow(
      DEAL_TEAM_ONLY,
    );
  });

  it('leaves the ask unanswered and tells nobody', async () => {
    const sent = await sentDuring(async () => {
      await as(
        lenderA,
        replyToAskAsInternal,
      )({ askId, body: 'Done' }).catch(() => undefined);
    });

    expect(await askRow(askId)).toMatchObject({
      status: 'open',
      first_response_at: null,
    });
    expect(sent).toEqual([]);
  });
});

describe('our reply with a fulfilment file', () => {
  let askId: string;
  let sent: SentNotification[];

  beforeAll(async () => {
    askId = await openInRoomA();
    sent = await sentDuring(() =>
      as(
        us,
        replyToAskAsInternal,
      )({
        askId,
        body: 'Attached.',
        documentIds: [roomADocumentId],
      }),
    );
  });

  it('answers the ask and stamps the first response', async () => {
    const ask = await askRow(askId);

    expect(ask.status).toBe('answered');
    expect(ask.first_response_at).not.toBeNull();
  });

  it('records our message', async () => {
    expect(await messagesOf(askId)).toEqual([
      { author_user_id: us.userId, side: 'internal', body: 'Attached.' },
    ]);
  });

  it('files the document as a fulfilment added by us', async () => {
    expect(await filesOf(askId)).toEqual([
      {
        id: expect.any(String),
        dr_document_id: roomADocumentId,
        role: 'fulfilment',
        added_by: us.userId,
      },
    ]);
  });

  it('tells every member of the room', () => {
    const payload = { roomId: roomA.roomId, askId, kind: 'ask' };

    expect(sent).toHaveLength(2);
    expect(sent).toEqual(
      expect.arrayContaining([
        {
          eventType: 'lender_ask.answered',
          recipientUserId: lenderA.userId,
          email: lenderA.email,
          payload,
        },
        {
          eventType: 'lender_ask.answered',
          recipientUserId: lenderA2.userId,
          email: lenderA2.email,
          payload,
        },
      ]),
    );
  });
});

describe('our reply', () => {
  it('keeps the first response time when we answer again after a reopen', async () => {
    const askId = await openInRoomA();
    await as(us, replyToAskAsInternal)({ askId, body: 'First.' });
    const first = (await askRow(askId)).first_response_at;
    await as(lenderA, replyToAskAsLender)({ askId, body: 'More?' });

    await as(us, replyToAskAsInternal)({ askId, body: 'Second.' });

    expect(await askRow(askId)).toMatchObject({
      status: 'answered',
      first_response_at: first,
    });
  });

  it('answers with a file alone and records no message', async () => {
    const askId = await openInRoomA();

    await as(
      us,
      replyToAskAsInternal,
    )({
      askId,
      documentIds: [roomADocumentId],
    });

    expect((await askRow(askId)).status).toBe('answered');
    expect(await messagesOf(askId)).toEqual([]);
  });

  it('is refused with neither a message nor a file', async () => {
    const askId = await openInRoomA();

    await expect(as(us, replyToAskAsInternal)({ askId })).rejects.toThrow(
      EMPTY_REPLY,
    );
  });

  it.each([
    ['in the master package', () => masterDocumentId],
    ['in another room’s folder', () => roomBDocumentId],
    ['elsewhere in the data room', () => unsharedDocumentId],
  ])('refuses a fulfilment file %s', async (_name, documentId) => {
    const askId = await openInRoomA();

    await expect(
      as(
        us,
        replyToAskAsInternal,
      )({
        askId,
        body: 'Attached.',
        documentIds: [documentId()],
      }),
    ).rejects.toThrow(NOT_IN_ROOM_FOLDER);
  });

  it('writes nothing when a fulfilment file is refused', async () => {
    const askId = await openInRoomA();

    await as(
      us,
      replyToAskAsInternal,
    )({
      askId,
      body: 'Attached.',
      documentIds: [masterDocumentId],
    }).catch(() => undefined);

    expect((await askRow(askId)).status).toBe('open');
    expect(await messagesOf(askId)).toEqual([]);
    expect(await filesOf(askId)).toEqual([]);
  });

  it('tells nobody when the room is no longer open', async () => {
    const room = await seedRoom(deal, 'Bank closed', [lenderA]);
    const askId = await openIn(room, lenderA);
    await admin
      .from('lender_room')
      .update({ closed_at: new Date().toISOString() })
      .eq('id', room.roomId)
      .throwOnError();

    const sent = await sentDuring(() =>
      as(us, replyToAskAsInternal)({ askId, body: 'Too late.' }),
    );

    expect(sent).toEqual([]);
  });
});

describe('lender edit and withdraw', () => {
  it('lets any lender in the room edit the ask before we respond', async () => {
    const askId = await openInRoomA();

    await as(
      lenderA2,
      editAsk,
    )({
      askId,
      title: 'TTM and balance sheet',
      body: 'Please share both.',
    });

    expect(await askRow(askId)).toMatchObject({
      title: 'TTM and balance sheet',
      body: 'Please share both.',
      status: 'open',
    });
  });

  it('trims an edited title', async () => {
    const askId = await openInRoomA();

    await as(lenderA, editAsk)({ askId, title: '  Tidy  ' });

    expect((await askRow(askId)).title).toBe('Tidy');
  });

  it('refuses an edit whose title is only spaces', async () => {
    const askId = await openInRoomA();

    await expect(as(lenderA, editAsk)({ askId, title: '   ' })).rejects.toThrow(
      'An ask needs a title',
    );
  });

  it('clears the body when an edit leaves it out', async () => {
    const askId = await openInRoomA();

    await as(lenderA, editAsk)({ askId, title: 'Just call me' });

    expect(await askRow(askId)).toMatchObject({
      title: 'Just call me',
      body: null,
    });
  });

  it('keeps a withdrawn ask visible to us as withdrawn', async () => {
    const askId = await openInRoomA();

    await as(lenderA, withdrawAsk)({ askId });

    const ours = await listAsks(us.client, roomA.roomId);
    expect(ours.find((ask) => ask.id === askId)?.status).toBe('withdrawn');
  });

  describe('after we responded and the lender reopened the ask', () => {
    let askId: string;

    beforeAll(async () => {
      askId = await openInRoomA();
      await as(us, replyToAskAsInternal)({ askId, body: 'Here.' });
      await as(lenderA, replyToAskAsLender)({ askId, body: 'Also?' });
    });

    it('refuses an edit', async () => {
      await expect(
        as(lenderA, editAsk)({ askId, title: 'New', body: 'New' }),
      ).rejects.toThrow(TOO_LATE_TO_EDIT);
    });

    it('refuses a withdraw', async () => {
      await expect(as(lenderA, withdrawAsk)({ askId })).rejects.toThrow(
        'You can no longer withdraw this request because the deal team has responded',
      );
    });
  });

  it('refuses an edit after we closed the ask without replying and the lender reopened it', async () => {
    const askId = await openInRoomA();
    await as(us, closeAskAsInternal)({ askId });
    await as(lenderA, replyToAskAsLender)({ askId, body: 'Wait.' });

    await expect(
      as(lenderA, editAsk)({ askId, title: 'New', body: 'New' }),
    ).rejects.toThrow(TOO_LATE_TO_EDIT);
  });
});

describe('a lender move racing our reply', () => {
  const stamp = '2026-10-01T09:00:00+00:00';

  function withOurReplyLandingAfterTheAskIsRead(
    person: Person,
    askId: string,
  ): Person {
    const ourReplyLands = () =>
      admin
        .from('lender_ask')
        .update({ status: 'answered', first_response_at: stamp })
        .eq('id', askId)
        .throwOnError();

    const client = new Proxy(person.client, {
      get(target, property) {
        if (property !== 'rpc') {
          return Reflect.get(target, property, target);
        }

        return (name: never, args: never) => ({
          throwOnError: () => ({
            then: (
              resolve: (value: unknown) => unknown,
              reject: (reason: unknown) => unknown,
            ) =>
              ourReplyLands()
                .then(() => target.rpc(name, args).throwOnError())
                .then(resolve, reject),
          }),
        });
      },
    });

    return { ...person, client };
  }

  it.each([
    ['close', closeAskAsLender, {}],
    ['edit', editAsk, { title: 'New', body: 'New' }],
    ['withdraw', withdrawAsk, {}],
  ])('refuses the %s', async (_name, action, input) => {
    const askId = await openInRoomA();
    const racingLender = withOurReplyLandingAfterTheAskIsRead(lenderA, askId);

    await expect(as(racingLender, action)({ askId, ...input })).rejects.toThrow(
      CHANGED,
    );
  });

  it('keeps our answer, our response stamp, and the lender’s original wording', async () => {
    const askId = await openInRoomA();
    const racingLender = withOurReplyLandingAfterTheAskIsRead(lenderA, askId);

    await as(
      racingLender,
      editAsk,
    )({ askId, title: 'New', body: 'New' }).catch(() => undefined);

    expect(await askRow(askId)).toMatchObject({
      status: 'answered',
      first_response_at: stamp,
      title: 'Trailing twelve months',
    });
  });
});

describe('closing', () => {
  it('lets us close an ask', async () => {
    const askId = await openInRoomA();

    await as(us, closeAskAsInternal)({ askId });

    expect((await askRow(askId)).status).toBe('closed');
  });

  it('counts our close as our first response', async () => {
    const askId = await openInRoomA();

    await as(us, closeAskAsInternal)({ askId });

    expect((await askRow(askId)).first_response_at).not.toBeNull();
  });

  it('lets the lender close an ask', async () => {
    const askId = await openInRoomA();

    await as(lenderA, closeAskAsLender)({ askId });

    expect(await askRow(askId)).toMatchObject({
      status: 'closed',
      first_response_at: null,
    });
  });

  it('refuses to close an ask that is already closed', async () => {
    const askId = await openInRoomA();
    await as(lenderA, closeAskAsLender)({ askId });

    await expect(as(us, closeAskAsInternal)({ askId })).rejects.toThrow(
      'This request is already closed',
    );
  });
});

describe('a lender reply with an attachment on a closed ask', () => {
  let askId: string;
  let sent: SentNotification[];

  beforeAll(async () => {
    askId = await openInRoomA();
    await as(us, closeAskAsInternal)({ askId });
    sent = await sentDuring(() =>
      as(
        lenderA,
        replyToAskAsLender,
      )({
        askId,
        body: 'One more thing.',
        documentIds: [masterDocumentId],
      }),
    );
  });

  it('reopens the ask', async () => {
    expect((await askRow(askId)).status).toBe('open');
  });

  it('records the lender’s message', async () => {
    expect(await messagesOf(askId)).toEqual([
      {
        author_user_id: lenderA.userId,
        side: 'lender',
        body: 'One more thing.',
      },
    ]);
  });

  it('files the document as an attachment added by the lender', async () => {
    expect(await filesOf(askId)).toEqual([
      {
        id: expect.any(String),
        dr_document_id: masterDocumentId,
        role: 'attachment',
        added_by: lenderA.userId,
      },
    ]);
  });

  it('tells our team', () => {
    const payload = { roomId: roomA.roomId, askId, kind: 'ask' };

    expect(sent).toHaveLength(2);
    expect(sent).toEqual(
      expect.arrayContaining([
        {
          eventType: 'lender_ask.replied',
          recipientUserId: us.userId,
          email: us.email,
          payload,
        },
        {
          eventType: 'lender_ask.replied',
          recipientUserId: colleague.userId,
          email: colleague.email,
          payload,
        },
      ]),
    );
  });
});

describe('a lender reply', () => {
  it('can be a file alone, recording no message', async () => {
    const askId = await openInRoomA();

    await as(
      lenderA,
      replyToAskAsLender,
    )({
      askId,
      documentIds: [roomADocumentId],
    });

    expect(await messagesOf(askId)).toEqual([]);
    expect(await filesOf(askId)).toHaveLength(1);
  });

  it('is refused with neither a message nor a file', async () => {
    const askId = await openInRoomA();

    await expect(as(lenderA, replyToAskAsLender)({ askId })).rejects.toThrow(
      EMPTY_REPLY,
    );
  });

  it('is refused when it attaches a document from another room', async () => {
    const askId = await openInRoomA();

    await expect(
      as(
        lenderA,
        replyToAskAsLender,
      )({
        askId,
        body: 'See attached.',
        documentIds: [roomBDocumentId],
      }),
    ).rejects.toThrow(NOT_SHOWN);
  });

  it('records no message when its attachment is refused', async () => {
    const askId = await openInRoomA();

    await as(
      lenderA,
      replyToAskAsLender,
    )({
      askId,
      body: 'See attached.',
      documentIds: [roomBDocumentId],
    }).catch(() => undefined);

    expect(await messagesOf(askId)).toEqual([]);
  });
});

describe('promote', () => {
  async function fulfilledAsk() {
    const askId = await openInRoomA([masterDocumentId]);
    await as(
      us,
      replyToAskAsInternal,
    )({
      askId,
      body: 'Attached.',
      documentIds: [roomADocumentId],
    });
    const files = await filesOf(askId);
    return {
      fulfilment: files.find((file) => file.role === 'fulfilment')!,
      attachment: files.find((file) => file.role === 'attachment')!,
    };
  }

  async function storagePathOf(documentId: string) {
    const { data } = await admin
      .from('dr_document')
      .select('storage_path')
      .eq('id', documentId)
      .single()
      .throwOnError();
    return data.storage_path;
  }

  describe('of a fulfilment file into a master package folder', () => {
    let targetFolderId: string;

    beforeAll(async () => {
      const subfolderId = await seedFolder(deal, 'Financials', masterFolderId);
      targetFolderId = await seedFolder(deal, 'Promoted', subfolderId);
      const { fulfilment } = await fulfilledAsk();
      await as(
        us,
        promoteAskFile,
      )({
        askFileId: fulfilment.id,
        folderId: targetFolderId,
      });
    });

    it('adds a document there with the same name and storage path', async () => {
      expect(await documentsIn(targetFolderId)).toEqual([
        {
          id: expect.any(String),
          name: 'bank-a-checklist.pdf',
          storage_path: await storagePathOf(roomADocumentId),
          version: 1,
        },
      ]);
    });

    it('leaves the original in the lender’s room', async () => {
      const { data: original } = await admin
        .from('dr_document')
        .select('folder_id, removed_at')
        .eq('id', roomADocumentId)
        .single()
        .throwOnError();

      expect(original).toEqual({
        folder_id: roomA.privateFolderId,
        removed_at: null,
      });
    });

    it('shows another room the copy but not the original', async () => {
      const [promoted] = await documentsIn(targetFolderId);

      const { data: seenByOtherRoom } = await lenderB.client
        .from('dr_document')
        .select('id')
        .in('id', [promoted!.id, roomADocumentId])
        .throwOnError();

      expect(seenByOtherRoom).toEqual([{ id: promoted!.id }]);
    });
  });

  it('adds nothing to the package for a lender attachment', async () => {
    const targetFolderId = await seedFolder(
      deal,
      'Attachment try',
      masterFolderId,
    );
    const { attachment } = await fulfilledAsk();

    await as(
      us,
      promoteAskFile,
    )({
      askFileId: attachment.id,
      folderId: targetFolderId,
    }).catch(() => undefined);

    expect(await documentsIn(targetFolderId)).toEqual([]);
  });

  it('refuses a lender', async () => {
    const targetFolderId = await seedFolder(deal, 'Lender try', masterFolderId);
    const { fulfilment } = await fulfilledAsk();

    await expect(
      as(
        lenderA,
        promoteAskFile,
      )({
        askFileId: fulfilment.id,
        folderId: targetFolderId,
      }),
    ).rejects.toThrow();
    expect(await documentsIn(targetFolderId)).toEqual([]);
  });

  it('leaves one row when the same file is promoted into the same folder twice', async () => {
    const targetFolderId = await seedFolder(deal, 'Twice', masterFolderId);
    const { fulfilment } = await fulfilledAsk();
    const promote = () =>
      as(
        us,
        promoteAskFile,
      )({
        askFileId: fulfilment.id,
        folderId: targetFolderId,
      });

    await promote();
    await promote();

    expect(await documentsIn(targetFolderId)).toHaveLength(1);
  });

  it('gives the promoted document the next version after same-named documents in the target folder', async () => {
    const targetFolderId = await seedFolder(deal, 'Versions', masterFolderId);
    await seedDocument(deal, targetFolderId, 'bank-a-checklist.pdf');
    await seedDocument(deal, targetFolderId, 'unrelated.pdf');
    const { fulfilment } = await fulfilledAsk();

    await as(
      us,
      promoteAskFile,
    )({
      askFileId: fulfilment.id,
      folderId: targetFolderId,
    });

    const versions = (await documentsIn(targetFolderId))
      .filter((row) => row.name === 'bank-a-checklist.pdf')
      .map((row) => row.version);
    expect(versions).toEqual([1, 2]);
  });

  describe('into a folder outside the master package', () => {
    let fulfilmentId: string;
    let outsideFolderId: string;
    let otherDealFolderId: string;

    beforeAll(async () => {
      fulfilmentId = (await fulfilledAsk()).fulfilment.id;
      outsideFolderId = await seedFolder(deal, 'Not for lenders');
      const otherDeal = await seedTeamDeal(us, colleague);
      otherDealFolderId = await seedFolder(otherDeal, 'Lender package');
      await admin
        .from('lender_package')
        .insert({
          deal_id: otherDeal.dealId,
          account_id: otherDeal.accountId,
          master_folder_id: otherDealFolderId,
        })
        .throwOnError();
    });

    it.each([
      ['elsewhere in the data room', () => outsideFolderId],
      ['a room’s private folder', () => roomB.privateFolderId],
      ['another deal’s master package', () => otherDealFolderId],
    ])('is refused for %s', async (_name, folderId) => {
      await expect(
        as(
          us,
          promoteAskFile,
        )({
          askFileId: fulfilmentId,
          folderId: folderId(),
        }),
      ).rejects.toThrow(NOT_IN_PACKAGE);
    });

    it('adds no document to the refused folder', async () => {
      await as(
        us,
        promoteAskFile,
      )({
        askFileId: fulfilmentId,
        folderId: outsideFolderId,
      }).catch(() => undefined);

      expect(await documentsIn(outsideFolderId)).toEqual([]);
    });
  });
});

describe('reading asks', () => {
  let askId: string;

  beforeAll(async () => {
    askId = await openInRoomA([masterDocumentId]);
    await as(
      us,
      replyToAskAsInternal,
    )({
      askId,
      body: 'First answer.',
      documentIds: [roomADocumentId],
    });
    await as(
      lenderA,
      replyToAskAsLender,
    )({
      askId,
      body: 'Thanks, one follow-up.',
    });
  });

  it('getAsk returns the thread oldest first', async () => {
    const ask = await getAsk(lenderA.client, askId);

    expect(ask.messages.map((message) => [message.side, message.body])).toEqual(
      [
        ['internal', 'First answer.'],
        ['lender', 'Thanks, one follow-up.'],
      ],
    );
  });

  it('getAsk returns the files oldest first', async () => {
    const ask = await getAsk(lenderA.client, askId);

    expect(ask.files.map((file) => [file.role, file.dr_document_id])).toEqual([
      ['attachment', masterDocumentId],
      ['fulfilment', roomADocumentId],
    ]);
  });

  it('listAsks reports each ask’s status', async () => {
    const listed = await listAsks(lenderA.client, roomA.roomId);

    expect(listed.find((ask) => ask.id === askId)?.status).toBe('open');
  });

  it('listAsks reports the newest message time as last activity', async () => {
    const listed = await listAsks(lenderA.client, roomA.roomId);
    const { data: newestMessage } = await admin
      .from('lender_ask_message')
      .select('created_at')
      .eq('ask_id', askId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
      .throwOnError();

    expect(
      Date.parse(listed.find((ask) => ask.id === askId)!.last_activity_at),
    ).toBe(Date.parse(newestMessage.created_at));
  });

  it('listAsks puts the ask with the newest message first', async () => {
    const older = await openInRoomA();
    await openInRoomA();

    await as(lenderA, replyToAskAsLender)({ askId: older, body: 'Bump.' });

    expect((await listAsks(us.client, roomA.roomId))[0]?.id).toBe(older);
  });

  it('listAsks puts the ask with the newest file first', async () => {
    const older = await openInRoomA();
    await openInRoomA();

    await as(
      lenderA,
      replyToAskAsLender,
    )({
      askId: older,
      documentIds: [roomADocumentId],
    });

    expect((await listAsks(us.client, roomA.roomId))[0]?.id).toBe(older);
  });
});

describe('a form ask', () => {
  let formId: string;
  let fileId: string;

  beforeAll(async () => {
    const { data: form } = await admin
      .from('lender_ask')
      .insert({
        room_id: roomA.roomId,
        account_id: deal.accountId,
        kind: 'form',
        return_route: 'upload',
        title: 'Personal financial statement',
        created_by: lenderA.userId,
      })
      .select('id')
      .single()
      .throwOnError();
    formId = form.id;

    const { data: file } = await admin
      .from('lender_ask_file')
      .insert({
        ask_id: formId,
        dr_document_id: roomADocumentId,
        role: 'fulfilment',
        added_by: us.userId,
      })
      .select('id')
      .single()
      .throwOnError();
    fileId = file.id;
  });

  it.each([
    [
      'a lender reply',
      () => as(lenderA, replyToAskAsLender)({ askId: formId, body: 'Hello' }),
    ],
    [
      'a lender edit',
      () => as(lenderA, editAsk)({ askId: formId, title: 'New', body: 'New' }),
    ],
    ['a lender withdraw', () => as(lenderA, withdrawAsk)({ askId: formId })],
    ['a lender close', () => as(lenderA, closeAskAsLender)({ askId: formId })],
    [
      'our reply',
      () => as(us, replyToAskAsInternal)({ askId: formId, body: 'Hello' }),
    ],
    ['our close', () => as(us, closeAskAsInternal)({ askId: formId })],
    ['getAsk', () => getAsk(us.client, formId)],
  ])('refuses %s', async (_name, attempt) => {
    await expect(attempt()).rejects.toThrow(REQUEST_NOT_FOUND);
  });

  it('has none of its files promoted to the package', async () => {
    const targetFolderId = await seedFolder(deal, 'Form try', masterFolderId);

    await as(
      us,
      promoteAskFile,
    )({
      askFileId: fileId,
      folderId: targetFolderId,
    }).catch(() => undefined);

    expect(await documentsIn(targetFolderId)).toEqual([]);
  });

  it('is unchanged after those attempts', async () => {
    expect(await askRow(formId)).toMatchObject({
      title: 'Personal financial statement',
      status: 'open',
      first_response_at: null,
    });
    expect(await messagesOf(formId)).toEqual([]);
  });

  it('is listed with its kind', async () => {
    const listed = await listAsks(us.client, roomA.roomId);

    expect(listed.find((ask) => ask.id === formId)?.kind).toBe('form');
  });
});

describe.each([
  ['Novu failing', () => (harness.novuIsDown = true)],
  [
    'the recipient lookup failing',
    () => (harness.recipientLookupIsDown = true),
  ],
])('with %s', (_name, breakIt) => {
  afterEach(() => {
    harness.novuIsDown = false;
    harness.recipientLookupIsDown = false;
  });

  it('a lender still opens an ask', async () => {
    breakIt();

    const askId = await openInRoomA();

    expect((await askRow(askId)).status).toBe('open');
  });

  it('our reply still answers the ask', async () => {
    const askId = await openInRoomA();
    breakIt();

    await as(us, replyToAskAsInternal)({ askId, body: 'Here.' });

    expect((await askRow(askId)).status).toBe('answered');
  });

  it('our reply still records the message', async () => {
    const askId = await openInRoomA();
    breakIt();

    await as(us, replyToAskAsInternal)({ askId, body: 'Here.' });

    expect(await messagesOf(askId)).toMatchObject([{ body: 'Here.' }]);
  });
});

describe('without Novu configured', () => {
  it.each([
    ['the API key', ['NOVU_API_KEY']],
    ['the API URL', ['NOVU_API_URL']],
    ['both settings', ['NOVU_API_KEY', 'NOVU_API_URL']],
  ])(
    'opening an ask succeeds and sends nothing when %s is missing',
    async (_name, missing) => {
      for (const name of missing) {
        delete process.env[name];
      }

      const sent = await sentDuring(() => openInRoomA());

      expect(sent).toEqual([]);
    },
  );

  it('our reply succeeds and sends nothing', async () => {
    const askId = await openInRoomA();
    delete process.env.NOVU_API_KEY;

    const sent = await sentDuring(() =>
      as(us, replyToAskAsInternal)({ askId, body: 'Here.' }),
    );

    expect((await askRow(askId)).status).toBe('answered');
    expect(sent).toEqual([]);
  });

  it('a lender reply succeeds and sends nothing', async () => {
    const askId = await openInRoomA();
    await as(us, replyToAskAsInternal)({ askId, body: 'Here.' });
    delete process.env.NOVU_API_KEY;

    const sent = await sentDuring(() =>
      as(lenderA, replyToAskAsLender)({ askId, body: 'Thanks.' }),
    );

    expect((await askRow(askId)).status).toBe('open');
    expect(sent).toEqual([]);
  });
});

describe('notification recipients', () => {
  it('include the owner of a personal account when a lender opens an ask on their deal', async () => {
    const personalDeal = await seedPersonalDeal(colleague);
    const room = await seedRoom(personalDeal, 'Bank C', [lenderB]);
    let askId = '';

    const sent = await sentDuring(async () => {
      askId = await openIn(room, lenderB);
    });

    expect(sent).toEqual([
      {
        eventType: 'lender_ask.opened',
        recipientUserId: colleague.userId,
        email: colleague.email,
        payload: { roomId: room.roomId, askId, kind: 'ask' },
      },
    ]);
  });

  it('leave out a lender who switched off the answered notification', async () => {
    const { data: personalAccount } = await admin
      .from('accounts')
      .select('id')
      .eq('primary_owner_user_id', lenderA2.userId)
      .eq('is_personal_account', true)
      .single()
      .throwOnError();
    const { data: preference } = await admin
      .from('notification_preference')
      .insert({
        account_id: personalAccount.id,
        recipient_user_id: lenderA2.userId,
        channel: 'email',
        event_type: 'lender_ask.answered',
        enabled: false,
      })
      .select('id')
      .single()
      .throwOnError();
    const askId = await openInRoomA();

    const sent = await sentDuring(() =>
      as(us, replyToAskAsInternal)({ askId, body: 'Here.' }),
    );
    await admin
      .from('notification_preference')
      .delete()
      .eq('id', preference.id)
      .throwOnError();

    expect(sent.map((notification) => notification.recipientUserId)).toEqual([
      lenderA.userId,
    ]);
  });
});
