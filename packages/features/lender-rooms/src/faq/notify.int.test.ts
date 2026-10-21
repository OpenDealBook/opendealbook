import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { unwrap } from '../actions/test-support/unwrap';
import {
  type Person,
  admin,
  provisionPerson,
  removeEverythingSeeded,
  seedTeamDeal,
  seedRoom,
} from '../asks/integration-harness';

interface SentNotification {
  eventType: string;
  to: { subscriberId: string; email?: string };
  payload: unknown;
}

const session = vi.hoisted(() => ({
  client: null as unknown,
  sent: [] as SentNotification[],
  novuIsDown: false,
  recipientLookupIsDown: false,
  loggedErrors: [] as string[],
}));

vi.mock('@odb/shared/logger', () => {
  const logger = {
    error: (_context: unknown, message: string) => {
      session.loggedErrors.push(message);
    },
    warn: () => {},
    info: () => {},
    debug: () => {},
  };
  return { getLogger: () => logger };
});

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => session.client,
}));

vi.mock('@odb/supabase/admin', async () => {
  const harness = await import('../asks/integration-harness');
  return {
    getSupabaseServerAdminClient: () =>
      new Proxy(harness.admin, {
        get(target, property) {
          if (property !== 'rpc') {
            return Reflect.get(target, property, target);
          }

          return (name: string, args: never) => {
            if (session.recipientLookupIsDown && name === 'lender_faq_recipients') {
              throw new Error('The recipient lookup is down');
            }
            return target.rpc(name as never, args);
          };
        },
      }),
  };
});

vi.mock('@odb/notifications/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@odb/notifications/server')>()),
  createNovuClient: () => {
    if (!process.env.NOVU_API_KEY || !process.env.NOVU_API_URL) {
      throw new Error('Missing required environment variable: NOVU_API_KEY');
    }

    return {
      trigger: async (
        eventType: string,
        data: { to: SentNotification['to']; payload: unknown },
      ) => {
        if (session.novuIsDown) {
          throw new Error('Novu is down');
        }
        session.sent.push({ eventType, to: data.to, payload: data.payload });
      },
    };
  },
}));

import { editFaqEntry, setFaqEntryStatus } from './manage';
import { notifyFaqEntryPublished } from './notify';
import { saveNewFaqEntry } from './publish';

let owner: Person;
let asker: Person;
let otherLender: Person;
let lenderInTwoRooms: Person;
let closedRoomLender: Person;
let hidingRoomLender: Person;
let deal: { accountId: string; dealId: string };
let askingRoom: { roomId: string };
let otherRoom: { roomId: string };
let hidingRoom: { roomId: string };
let sharedRooms: [{ roomId: string }, { roomId: string }];

async function seedAnsweredAsk() {
  const { data } = await admin
    .from('lender_ask')
    .insert({
      room_id: askingRoom.roomId,
      account_id: deal.accountId,
      kind: 'ask',
      status: 'answered',
      created_by: asker.userId,
      title: 'What was 2025 EBITDA?',
      body: null,
    })
    .select('id')
    .single()
    .throwOnError();

  return data.id;
}

function newEntry(overrides: Record<string, unknown> = {}) {
  return {
    entryId: crypto.randomUUID(),
    dealId: deal.dealId,
    askIds: [] as string[],
    question: 'What was 2025 EBITDA?',
    answer: 'About 2.1M adjusted.',
    status: 'published' as const,
    files: [] as { askFileId: string; name: string }[],
    ...overrides,
  };
}

async function publish(overrides: Record<string, unknown> = {}) {
  const entry = newEntry(overrides);
  session.client = owner.client;
  await unwrap(saveNewFaqEntry(entry));
  return entry.entryId;
}

function digestEventFor(person: Person, roomId: string, entryId: string) {
  return {
    eventType: 'lender-room-documents',
    to: { subscriberId: person.userId, email: person.email },
    payload: { kind: 'faq', entryId, roomId },
  };
}

beforeAll(async () => {
  [
    owner,
    asker,
    otherLender,
    lenderInTwoRooms,
    closedRoomLender,
    hidingRoomLender,
  ] = await Promise.all([
    provisionPerson(),
    provisionPerson(),
    provisionPerson(),
    provisionPerson(),
    provisionPerson(),
    provisionPerson(),
  ]);
  deal = await seedTeamDeal(owner);
  askingRoom = await seedRoom(deal, 'Asking Bank', [asker]);
  otherRoom = await seedRoom(deal, 'Other Bank', [otherLender]);
  hidingRoom = await seedRoom(deal, 'Hiding Bank', [hidingRoomLender]);
  sharedRooms = [
    await seedRoom(deal, 'Shared Bank A', [lenderInTwoRooms]),
    await seedRoom(deal, 'Shared Bank B', [lenderInTwoRooms]),
  ];
  sharedRooms.sort((a, b) => a.roomId.localeCompare(b.roomId));

  const closedRoom = await seedRoom(deal, 'Closed Bank', [closedRoomLender]);
  await admin
    .from('lender_room')
    .update({ closed_at: new Date().toISOString() })
    .eq('id', closedRoom.roomId)
    .throwOnError();
}, 60_000);

beforeEach(() => {
  process.env.NOVU_API_KEY = 'test-key';
  process.env.NOVU_API_URL = 'http://novu.test';
  session.sent.length = 0;
  session.novuIsDown = false;
  session.recipientLookupIsDown = false;
  session.loggedErrors.length = 0;
});

afterAll(async () => {
  await admin
    .from('lender_faq_entry')
    .delete()
    .eq('deal_id', deal.dealId)
    .throwOnError();
  await removeEverythingSeeded();
}, 60_000);

describe('publishing a new FAQ entry', () => {
  it('puts it in the digest of every lender in every open room of the deal, the asking room included', async () => {
    const askId = await seedAnsweredAsk();
    const entryId = await publish({ askIds: [askId] });

    expect(session.sent).toHaveLength(4);
    expect(session.sent).toEqual(
      expect.arrayContaining([
        digestEventFor(asker, askingRoom.roomId, entryId),
        digestEventFor(otherLender, otherRoom.roomId, entryId),
        digestEventFor(hidingRoomLender, hidingRoom.roomId, entryId),
        digestEventFor(lenderInTwoRooms, sharedRooms[0].roomId, entryId),
      ]),
    );
  });

  it('tells nobody about a draft', async () => {
    await publish({ status: 'draft' });

    expect(session.sent).toEqual([]);
  });
});

describe('changing an existing entry', () => {
  async function setStatus(entryId: string, status: 'published' | 'unpublished') {
    session.client = owner.client;
    await unwrap(setFaqEntryStatus({ entryId, status }));
  }

  it('tells the lenders when a draft is published', async () => {
    const entryId = await publish({ status: 'draft' });

    await setStatus(entryId, 'published');

    expect(session.sent).toContainEqual(
      digestEventFor(otherLender, otherRoom.roomId, entryId),
    );
    expect(session.sent).toHaveLength(4);
  });

  it('tells the lenders again when an unpublished entry is republished', async () => {
    const entryId = await publish();
    await setStatus(entryId, 'unpublished');
    session.sent.length = 0;

    await setStatus(entryId, 'published');

    expect(session.sent).toContainEqual(
      digestEventFor(otherLender, otherRoom.roomId, entryId),
    );
    expect(session.sent).toHaveLength(4);
  });

  it('tells nobody when a published entry is published again', async () => {
    const entryId = await publish();
    session.sent.length = 0;

    await setStatus(entryId, 'published');

    expect(session.sent).toEqual([]);
  });

  it('tells nobody when an entry is unpublished', async () => {
    const entryId = await publish();
    session.sent.length = 0;

    await setStatus(entryId, 'unpublished');

    expect(session.sent).toEqual([]);
  });

  it('tells nobody when a published entry is edited', async () => {
    const entryId = await publish();
    session.sent.length = 0;
    session.client = owner.client;
    await unwrap(
      editFaqEntry({
        entryId,
        question: 'What was 2025 adjusted EBITDA?',
        answer: 'About 2.1M.',
        version: (
          await admin
            .from('lender_faq_entry')
            .select('version')
            .eq('id', entryId)
            .single()
            .throwOnError()
        ).data.version,
      }),
    );

    expect(session.sent).toEqual([]);
  });
});

describe('notifying that an entry was published', () => {
  it('leaves out a room that hides the entry', async () => {
    const entryId = await publish();
    await admin
      .from('lender_faq_hidden')
      .insert({
        room_id: hidingRoom.roomId,
        deal_id: deal.dealId,
        entry_id: entryId,
      })
      .throwOnError();
    session.sent.length = 0;

    await notifyFaqEntryPublished(entryId);

    expect(session.sent.map((sent) => sent.to.subscriberId)).not.toContain(
      hidingRoomLender.userId,
    );
    expect(session.sent).toHaveLength(3);
  });

  it('keeps the entry published and logs the failure when Novu is down', async () => {
    session.novuIsDown = true;

    const entryId = await publish();
    const { data: entry } = await admin
      .from('lender_faq_entry')
      .select('status')
      .eq('id', entryId)
      .single()
      .throwOnError();

    expect(entry.status).toBe('published');
    expect(session.loggedErrors).toEqual(
      Array(4).fill('Lender FAQ notification failed'),
    );
  });

  it('keeps the entry published and logs the failure when the recipient lookup fails', async () => {
    session.recipientLookupIsDown = true;

    const entryId = await publish();
    const { data: entry } = await admin
      .from('lender_faq_entry')
      .select('status')
      .eq('id', entryId)
      .single()
      .throwOnError();

    expect(entry.status).toBe('published');
    expect(session.sent).toEqual([]);
    expect(session.loggedErrors).toEqual(['Lender FAQ notification failed']);
  });

  it.each([
    ['the API key', 'NOVU_API_KEY'],
    ['the API URL', 'NOVU_API_URL'],
  ])('sends nothing and does not fail without %s', async (_, setting) => {
    delete process.env[setting];

    const entryId = await publish();
    const { data: entry } = await admin
      .from('lender_faq_entry')
      .select('status')
      .eq('id', entryId)
      .single()
      .throwOnError();

    expect(entry.status).toBe('published');
    expect(session.sent).toEqual([]);
  });
});
