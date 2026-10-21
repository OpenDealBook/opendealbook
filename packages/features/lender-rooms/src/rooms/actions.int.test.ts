import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { Database } from '@odb/supabase';

const caller = vi.hoisted(() => ({
  client: null as unknown,
  admin: null as unknown,
}));

vi.mock('@odb/next/actions', () => ({
  enhanceAction:
    (
      fn: (input: unknown, user: unknown) => unknown,
      config: { schema: { parse: (input: unknown) => unknown } },
    ) =>
    async (input: unknown) =>
      fn(
        config.schema.parse(input),
        (await (caller.client as SupabaseClient<Database>).auth.getUser()).data
          .user,
      ),
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => caller.client,
}));

vi.mock('@odb/supabase/admin', () => ({
  getSupabaseServerAdminClient: () => caller.admin,
}));

import { unwrap } from '../actions/test-support/unwrap';
import {
  closeLenderRoom,
  createLenderRoom,
  prepareLenderRoomClose,
  listLenderRooms,
  reopenLenderRoom,
  setLenderRoomExpiry,
  setLenderRoomStatus,
  setLenderRoomWelcomeNote,
  startLenderPackage,
} from './actions';

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';

const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;
const CHOSEN_EXPIRY_DAY = { date: '2031-01-15', timeZone: 'UTC' };
const CHOSEN_EXPIRY = '2031-01-15T23:59:59.999Z';
const PAST_EXPIRY_DAY = { date: '2020-01-15', timeZone: 'UTC' };

interface Person {
  client: SupabaseClient<Database>;
  userId: string;
  email: string;
}

const clientOptions = {
  auth: { persistSession: false, autoRefreshToken: false },
};

const admin = createClient<Database>(
  SUPABASE_URL,
  SERVICE_ROLE_KEY,
  clientOptions,
);

const people: Person[] = [];
const cachedBrandDomain = `lender-${crypto.randomUUID().slice(0, 8)}.test`;
const otherCachedBrandDomain = `other-${cachedBrandDomain}`;

let owner: Person;
let outsider: Person;
let lender: Person;
let teamAccountId: string;
let teamMember: Person;

async function provisionPerson(): Promise<Person> {
  const unique = crypto.randomUUID().slice(0, 8);
  const email = `int-${unique}@odb.test`;
  const password = `Pw-${unique}-Aa1!`;

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    throw error;
  }

  const client = createClient<Database>(SUPABASE_URL, ANON_KEY, clientOptions);
  const signedIn = await client.auth.signInWithPassword({ email, password });

  if (signedIn.error) {
    throw signedIn.error;
  }

  const person = {
    client,
    userId: created.user.id,
    email,
  };
  people.push(person);

  return person;
}

const defaultFolderIds = new Map<string, string[]>();

async function newDeal(): Promise<string> {
  const dealId = crypto.randomUUID();

  await admin
    .rpc('append_deal_event', {
      p_deal_id: dealId,
      p_aggregate_type: 'deal',
      p_aggregate_id: dealId,
      p_event_type: 'deal.created',
      p_payload: {
        account_id: teamAccountId,
        description: 'Lender room deal',
      },
      p_actor_kind: 'service',
    })
    .throwOnError();

  const { data: defaults } = await admin
    .from('dr_folder')
    .select('id')
    .eq('deal_id', dealId)
    .throwOnError();
  defaultFolderIds.set(dealId, defaults.map((folder) => folder.id));

  return dealId;
}

async function newRoom(dealId: string, name = 'First Bank') {
  caller.client = owner.client;

  return unwrap(createLenderRoom({ dealId, name }));
}

async function newBrandedRoom(dealId: string, name: string, website: string) {
  caller.client = owner.client;

  return createLenderRoom({ dealId, name, brandDomain: website });
}

type Chain = Record<string | symbol, (...args: unknown[]) => Chain>;

function replayedAfter(before: () => Promise<void>, start: () => Chain) {
  const calls: [string | symbol, unknown[]][] = [];

  const recorder: Chain = new Proxy({} as Chain, {
    get(_, method) {
      if (method === 'then') {
        return (resolve: () => void, reject: () => void) =>
          before()
            .then(() =>
              calls.reduce(
                (chain, [name, args]) => chain[name]!(...args),
                start(),
              ),
            )
            .then(resolve, reject);
      }

      return (...args: unknown[]) => {
        calls.push([method, args]);

        return recorder;
      };
    },
  });

  return recorder;
}

function insertingRoomsAfter(
  before: () => Promise<void>,
  collidingRoomId: string,
) {
  return {
    auth: owner.client.auth,
    rpc: owner.client.rpc.bind(owner.client),
    from(table: 'lender_room') {
      const query = owner.client.from(table);

      if (table !== 'lender_room') {
        return query;
      }

      return {
        select: query.select.bind(query),
        insert: (room: Database['public']['Tables']['lender_room']['Insert']) =>
          replayedAfter(
            before,
            () =>
              owner.client
                .from('lender_room')
                .insert({ ...room, id: collidingRoomId }) as unknown as Chain,
          ),
      };
    },
  };
}

async function closingTodos(roomId: string) {
  const { data } = await admin
    .from('personal_todo')
    .select('user_id, title, done')
    .eq('title', 'Tell First Bank the room is closing')
    .in(
      'id',
      (
        await admin
          .from('room_closing_todo')
          .select('todo_id')
          .eq('room_id', roomId)
          .throwOnError()
      ).data.map((link) => link.todo_id),
    )
    .throwOnError();

  return data;
}

async function toldLender(roomId: string) {
  await unwrap(prepareLenderRoomClose({ roomId }));
  const { data: links } = await admin
    .from('room_closing_todo')
    .select('todo_id')
    .eq('room_kind', 'lender')
    .eq('room_id', roomId)
    .throwOnError();
  await admin
    .from('personal_todo')
    .update({ done: true })
    .in(
      'id',
      links.map((link) => link.todo_id),
    )
    .throwOnError();
}

async function newClosedRoom(dealId: string) {
  const roomId = await newRoom(dealId);
  await toldLender(roomId);
  await unwrap(closeLenderRoom({ roomId }));

  return roomId;
}

async function readRoom(roomId: string) {
  const { data } = await admin
    .from('lender_room')
    .select('*')
    .eq('id', roomId)
    .single()
    .throwOnError();

  return data;
}

async function readDealRooms(dealId: string) {
  const { data } = await admin
    .from('lender_room')
    .select('*')
    .eq('deal_id', dealId)
    .order('created_at')
    .throwOnError();

  return data;
}

async function readDealFolders(dealId: string) {
  const { data } = await admin
    .from('dr_folder')
    .select('id, name, parent_id, account_id')
    .eq('deal_id', dealId)
    .throwOnError();

  const defaults = defaultFolderIds.get(dealId)!;

  return data.filter((folder) => !defaults.includes(folder.id));
}

async function readPackages(dealId: string) {
  const { data } = await admin
    .from('lender_package')
    .select('account_id, master_folder_id')
    .eq('deal_id', dealId)
    .throwOnError();

  return data;
}

function isoInstant(timestamp: string | null) {
  return new Date(timestamp!).toISOString();
}

function expectWithinAMinuteOf(timestamp: string | null, instantMs: number) {
  expect(Math.abs(new Date(timestamp!).getTime() - instantMs)).toBeLessThan(
    60_000,
  );
}

function expectSixtyDaysFromNow(expiresAt: string | null) {
  expectWithinAMinuteOf(expiresAt, Date.now() + SIXTY_DAYS_MS);
}

beforeAll(async () => {
  caller.admin = admin;
  owner = await provisionPerson();

  const { data: team } = await admin
    .rpc('create_team_account', {
      account_name: 'Lender Rooms Team',
      user_id: owner.userId,
      account_slug: `lender-rooms-${crypto.randomUUID().slice(0, 8)}`,
    })
    .throwOnError();
  teamAccountId = team.id;

  teamMember = await provisionPerson();
  await admin
    .from('accounts_memberships')
    .insert({
      account_id: teamAccountId,
      user_id: teamMember.userId,
      account_role: 'member',
    })
    .throwOnError();

  outsider = await provisionPerson();
  lender = await provisionPerson();

  await admin
    .from('lender_brand')
    .insert([
      { domain: cachedBrandDomain, name: 'First Bank' },
      { domain: otherCachedBrandDomain, name: 'Second Bank' },
    ])
    .throwOnError();
});

afterAll(async () => {
  await admin
    .from('lender_room')
    .delete()
    .eq('account_id', teamAccountId)
    .throwOnError();
  for (const person of people) {
    const { error } = await admin.auth.admin.deleteUser(person.userId);

    if (error) {
      throw error;
    }
  }

  await admin
    .from('lender_brand')
    .delete()
    .in('domain', [cachedBrandDomain, otherCachedBrandDomain])
    .throwOnError();
});

describe('createLenderRoom (integration)', () => {
  it('creates a root "Lender package" folder on a deal that has no package', async () => {
    const dealId = await newDeal();

    await newRoom(dealId);

    expect(
      (await readDealFolders(dealId)).filter(
        (folder) => folder.name === 'Lender package',
      ),
    ).toEqual([
      {
        id: expect.any(String),
        name: 'Lender package',
        parent_id: null,
        account_id: teamAccountId,
      },
    ]);
  });

  it('creates the package pointing at the "Lender package" folder', async () => {
    const dealId = await newDeal();

    await newRoom(dealId);

    const masterFolder = (await readDealFolders(dealId)).find(
      (folder) => folder.name === 'Lender package',
    );
    expect(await readPackages(dealId)).toEqual([
      { account_id: teamAccountId, master_folder_id: masterFolder!.id },
    ]);
  });

  it('gives the room a private root folder that is not the master folder', async () => {
    const dealId = await newDeal();

    const roomId = await newRoom(dealId);

    const privateFolders = (await readDealFolders(dealId)).filter(
      (folder) => folder.name !== 'Lender package',
    );
    expect(privateFolders).toEqual([
      {
        id: (await readRoom(roomId)).private_folder_id,
        name: 'First Bank',
        parent_id: null,
        account_id: teamAccountId,
      },
    ]);
  });

  it('returns the id of a room stored on the deal with its name and welcome note', async () => {
    const dealId = await newDeal();
    caller.client = owner.client;

    const roomId = await unwrap(
      createLenderRoom({
        dealId,
        name: 'First Bank',
        welcomeNote: 'Welcome aboard',
      }),
    );

    expect(await readRoom(roomId)).toMatchObject({
      account_id: teamAccountId,
      deal_id: dealId,
      name: 'First Bank',
      welcome_note: 'Welcome aboard',
    });
  });

  it('starts a new room as invited', async () => {
    const roomId = await newRoom(await newDeal());

    expect((await readRoom(roomId)).status).toBe('invited');
  });

  it('starts a new room open', async () => {
    const roomId = await newRoom(await newDeal());

    expect((await readRoom(roomId)).closed_at).toBeNull();
  });

  it('gives a new room 60 days before it expires', async () => {
    const roomId = await newRoom(await newDeal());

    expectSixtyDaysFromNow((await readRoom(roomId)).expires_at);
  });

  it('reuses the existing package for a second room on the deal', async () => {
    const dealId = await newDeal();
    await newRoom(dealId, 'First Bank');
    const [packageBefore] = await readPackages(dealId);

    await newRoom(dealId, 'Second Bank');

    expect(await readPackages(dealId)).toEqual([packageBefore]);
    expect(
      (await readDealFolders(dealId)).filter(
        (folder) => folder.name === 'Lender package',
      ),
    ).toHaveLength(1);
  });

  it('gives a second room its own private folder', async () => {
    const dealId = await newDeal();
    const first = await readRoom(await newRoom(dealId, 'First Bank'));

    const second = await readRoom(await newRoom(dealId, 'Second Bank'));

    expect(second.private_folder_id).not.toBe(first.private_folder_id);
  });

  it('brands the room with the cached brand its domain normalises to', async () => {
    caller.client = owner.client;

    const roomId = await unwrap(
      createLenderRoom({
        dealId: await newDeal(),
        name: 'First Bank',
        brandDomain: `WWW.${cachedBrandDomain.toUpperCase()}`,
      }),
    );

    expect((await readRoom(roomId)).brand_domain).toBe(cachedBrandDomain);
  });

  it('refuses a website that has not been looked up, creating nothing', async () => {
    const dealId = await newDeal();

    expect(
      await newBrandedRoom(
        dealId,
        'First Bank',
        `unknown-${cachedBrandDomain}`,
      ),
    ).toEqual({
      ok: false,
      refusal: 'Look the website up before creating the room',
    });

    expect(await readDealRooms(dealId)).toEqual([]);
    expect(await readDealFolders(dealId)).toEqual([]);
  });

  it('refuses a website that is not a domain, creating nothing', async () => {
    const dealId = await newDeal();

    expect(await newBrandedRoom(dealId, 'First Bank', 'not a domain')).toEqual({
      ok: false,
      refusal: 'Enter a website like firstbank.com, or leave it empty',
    });

    expect(await readDealRooms(dealId)).toEqual([]);
    expect(await readDealFolders(dealId)).toEqual([]);
  });

  it('trims the room name', async () => {
    const roomId = await newRoom(await newDeal(), '  First Bank  ');

    expect((await readRoom(roomId)).name).toBe('First Bank');
  });

  it('shows a room created with only a name under that name, with no brand name or logo', async () => {
    const roomId = await newRoom(await newDeal(), 'Pat Private Lender');

    const { data: views } = await owner.client
      .rpc('lender_room_view', { room_id: roomId })
      .throwOnError();

    expect(views).toHaveLength(1);
    expect(views[0]).toMatchObject({
      id: roomId,
      name: 'Pat Private Lender',
      brand_name: null,
      brand_logo_path: null,
    });
    expect((await readRoom(roomId)).brand_domain).toBeNull();
  });

  it('refuses a room name that is empty after trimming, asking for the lender name', async () => {
    const dealId = await newDeal();
    caller.client = owner.client;

    expect(await createLenderRoom({ dealId, name: '   ' })).toEqual({
      ok: false,
      refusal: "Enter the lender's name",
    });

    expect(await readDealRooms(dealId)).toEqual([]);
    expect(await readDealFolders(dealId)).toEqual([]);
  });
});

describe('startLenderPackage (integration)', () => {
  const onlyTheDealTeam = {
    ok: false,
    refusal: 'Only the deal team can do that',
  };

  it('starts the package on a team deal and returns its root "Lender package" folder', async () => {
    const dealId = await newDeal();
    caller.client = owner.client;

    const masterFolderId = await unwrap(startLenderPackage({ dealId }));

    expect(await readPackages(dealId)).toEqual([
      { account_id: teamAccountId, master_folder_id: masterFolderId },
    ]);
    expect(await readDealFolders(dealId)).toEqual([
      {
        id: masterFolderId,
        name: 'Lender package',
        parent_id: null,
        account_id: teamAccountId,
      },
    ]);
  });

  it('returns the same folder when started a second time', async () => {
    const dealId = await newDeal();
    caller.client = owner.client;
    const first = await unwrap(startLenderPackage({ dealId }));

    const second = await unwrap(startLenderPackage({ dealId }));

    expect(second).toBe(first);
    expect(await readPackages(dealId)).toHaveLength(1);
    expect(await readDealFolders(dealId)).toHaveLength(1);
  });

  it('puts rooms created later on the package already started', async () => {
    const dealId = await newDeal();
    caller.client = owner.client;
    const masterFolderId = await unwrap(startLenderPackage({ dealId }));

    await newRoom(dealId);

    expect(await readPackages(dealId)).toEqual([
      { account_id: teamAccountId, master_folder_id: masterFolderId },
    ]);
    expect(
      (await readDealFolders(dealId)).filter(
        (folder) => folder.name === 'Lender package',
      ),
    ).toHaveLength(1);
  });

  it('converges two simultaneous first starts on one package and one folder', async () => {
    const dealId = await newDeal();
    caller.client = owner.client;

    const [first, second] = await Promise.all([
      unwrap(startLenderPackage({ dealId })),
      unwrap(startLenderPackage({ dealId })),
    ]);

    expect(second).toBe(first);
    expect(await readPackages(dealId)).toEqual([
      { account_id: teamAccountId, master_folder_id: first },
    ]);
    expect(await readDealFolders(dealId)).toHaveLength(1);
  });

  it('refuses a team member who cannot manage deals, creating nothing', async () => {
    const dealId = await newDeal();
    caller.client = teamMember.client;

    expect(await startLenderPackage({ dealId })).toEqual(onlyTheDealTeam);

    expect(await readPackages(dealId)).toEqual([]);
    expect(await readDealFolders(dealId)).toEqual([]);
  });

  it('refuses a lender in a room on the deal', async () => {
    const dealId = await newDeal();
    const roomId = await newRoom(dealId);
    await admin
      .from('lender_room_member')
      .insert({
        room_id: roomId,
        user_id: lender.userId,
        email: lender.email,
        invited_by: owner.userId,
      })
      .throwOnError();
    const foldersBefore = await readDealFolders(dealId);
    caller.client = lender.client;

    expect(await startLenderPackage({ dealId })).toEqual(onlyTheDealTeam);

    expect(await readDealFolders(dealId)).toEqual(foldersBefore);
  });

  it('refuses the owner of an unrelated account, creating nothing', async () => {
    const dealId = await newDeal();
    caller.client = outsider.client;

    expect(await startLenderPackage({ dealId })).toEqual(onlyTheDealTeam);

    expect(await readPackages(dealId)).toEqual([]);
    expect(await readDealFolders(dealId)).toEqual([]);
  });
});

describe('createLenderRoom by a team member who cannot manage deals (integration)', () => {
  it('refuses with the deal team message, creating nothing', async () => {
    const dealId = await newDeal();
    caller.client = teamMember.client;

    expect(await createLenderRoom({ dealId, name: 'First Bank' })).toEqual({
      ok: false,
      refusal: 'Only the deal team can do that',
    });

    expect(await readDealRooms(dealId)).toEqual([]);
    expect(await readDealFolders(dealId)).toEqual([]);
    expect(await readPackages(dealId)).toEqual([]);
  });
});

describe('createLenderRoom, one room per website on a deal (integration)', () => {
  const alreadyThere = {
    ok: false,
    refusal: 'First Bank already has a room on this deal',
  };

  it('refuses a second room whose website is the same domain with www and other casing', async () => {
    const dealId = await newDeal();
    await newBrandedRoom(dealId, 'First Bank', cachedBrandDomain);
    const foldersBefore = await readDealFolders(dealId);

    expect(
      await newBrandedRoom(
        dealId,
        'First Bank again',
        `https://WWW.${cachedBrandDomain.toUpperCase()}/about`,
      ),
    ).toEqual(alreadyThere);

    expect(await readDealRooms(dealId)).toHaveLength(1);
    expect(await readDealFolders(dealId)).toEqual(foldersBefore);
  });

  it('refuses a second room for the website of a closed room', async () => {
    const dealId = await newDeal();
    const roomId = await unwrap(
      newBrandedRoom(dealId, 'First Bank', cachedBrandDomain),
    );
    await toldLender(roomId);
    await unwrap(closeLenderRoom({ roomId }));

    expect(
      await newBrandedRoom(dealId, 'First Bank again', cachedBrandDomain),
    ).toEqual(alreadyThere);
  });

  it('refuses a second room for the website of an expired room', async () => {
    const dealId = await newDeal();
    const roomId = await unwrap(
      newBrandedRoom(dealId, 'First Bank', cachedBrandDomain),
    );
    await unwrap(setLenderRoomExpiry({ roomId, ...PAST_EXPIRY_DAY }));

    expect(
      await newBrandedRoom(dealId, 'First Bank again', cachedBrandDomain),
    ).toEqual(alreadyThere);
  });

  it('allows a room for a different website on the same deal', async () => {
    const dealId = await newDeal();
    await newBrandedRoom(dealId, 'First Bank', cachedBrandDomain);

    const second = await newBrandedRoom(
      dealId,
      'Second Bank',
      otherCachedBrandDomain,
    );

    expect(second.ok).toBe(true);
    expect(await readDealRooms(dealId)).toHaveLength(2);
  });

  it('allows a room for the same website on another deal', async () => {
    await newBrandedRoom(await newDeal(), 'First Bank', cachedBrandDomain);
    const otherDealId = await newDeal();

    const second = await newBrandedRoom(
      otherDealId,
      'First Bank',
      cachedBrandDomain,
    );

    expect(second.ok).toBe(true);
    expect(await readDealRooms(otherDealId)).toHaveLength(1);
  });

  it('allows two rooms created from the same name alone', async () => {
    const dealId = await newDeal();
    await newRoom(dealId, 'Pat Private Lender');

    await newRoom(dealId, 'Pat Private Lender');

    expect(await readDealRooms(dealId)).toHaveLength(2);
  });

  it('gives the same refusal when another create for the website lands between its check and its insert', async () => {
    const dealId = await newDeal();
    const rivalRoomId = crypto.randomUUID();

    async function landRivalRoom() {
      const { data: rivalFolder } = await admin
        .from('dr_folder')
        .insert({
          account_id: teamAccountId,
          deal_id: dealId,
          name: 'Rival Bank',
        })
        .select('id')
        .single()
        .throwOnError();

      await admin
        .from('lender_room')
        .insert({
          id: rivalRoomId,
          account_id: teamAccountId,
          deal_id: dealId,
          name: 'Rival Bank',
          brand_domain: cachedBrandDomain,
          private_folder_id: rivalFolder.id,
        })
        .throwOnError();
    }

    caller.client = insertingRoomsAfter(landRivalRoom, rivalRoomId);

    expect(
      await createLenderRoom({
        dealId,
        name: 'First Bank',
        brandDomain: cachedBrandDomain,
      }),
    ).toEqual({
      ok: false,
      refusal: 'Rival Bank already has a room on this deal',
    });
    expect((await readDealRooms(dealId)).map((room) => room.id)).toEqual([
      rivalRoomId,
    ]);
  });
});

describe('setLenderRoomStatus (integration)', () => {
  it('clears expiry when a room is marked selected', async () => {
    const roomId = await newRoom(await newDeal());

    await unwrap(setLenderRoomStatus({ roomId, status: 'selected' }));

    expect(await readRoom(roomId)).toMatchObject({
      status: 'selected',
      expires_at: null,
    });
  });

  it('gives a room a fresh 60 days when it leaves selected', async () => {
    const roomId = await newRoom(await newDeal());
    await unwrap(setLenderRoomStatus({ roomId, status: 'selected' }));

    await unwrap(setLenderRoomStatus({ roomId, status: 'reviewing' }));

    const reviewing = await readRoom(roomId);
    expect(reviewing.status).toBe('reviewing');
    expectSixtyDaysFromNow(reviewing.expires_at);
  });

  it('leaves expiry untouched when a room moves between unselected statuses', async () => {
    const roomId = await newRoom(await newDeal());
    await unwrap(setLenderRoomExpiry({ roomId, ...CHOSEN_EXPIRY_DAY }));

    await unwrap(setLenderRoomStatus({ roomId, status: 'term_sheet' }));

    const moved = await readRoom(roomId);
    expect(moved.status).toBe('term_sheet');
    expect(isoInstant(moved.expires_at)).toBe(CHOSEN_EXPIRY);
  });

  it('changes only the label when a room is declined', async () => {
    const roomId = await newRoom(await newDeal());
    const before = await readRoom(roomId);

    await unwrap(setLenderRoomStatus({ roomId, status: 'declined' }));

    expect(await readRoom(roomId)).toEqual({
      ...before,
      status: 'declined',
      updated_at: expect.any(String),
    });
  });
});

describe('setLenderRoomExpiry (integration)', () => {
  it('ends a typed date at 11:59 PM in the time zone of the person setting it', async () => {
    const roomId = await newRoom(await newDeal());

    await unwrap(
      setLenderRoomExpiry({
        roomId,
        date: '2027-07-15',
        timeZone: 'America/Chicago',
      }),
    );

    expect(isoInstant((await readRoom(roomId)).expires_at)).toBe(
      '2027-07-16T04:59:59.999Z',
    );
  });

  it('refuses a time zone it cannot read and leaves the expiry alone', async () => {
    const roomId = await newRoom(await newDeal());
    const before = (await readRoom(roomId)).expires_at;

    expect(
      await setLenderRoomExpiry({
        roomId,
        date: '2027-07-15',
        timeZone: 'Mars/Olympus_Mons',
      }),
    ).toEqual({
      ok: false,
      refusal:
        'Your time zone could not be read. Reload the page and try again',
    });

    expect((await readRoom(roomId)).expires_at).toBe(before);
  });

  it('accepts a date that has already passed', async () => {
    const roomId = await newRoom(await newDeal());

    await unwrap(setLenderRoomExpiry({ roomId, ...PAST_EXPIRY_DAY }));

    expect(isoInstant((await readRoom(roomId)).expires_at)).toBe(
      '2020-01-15T23:59:59.999Z',
    );
  });

  it('refuses to set an expiry on a selected room', async () => {
    const roomId = await newRoom(await newDeal());
    await unwrap(setLenderRoomStatus({ roomId, status: 'selected' }));

    await expect(
      unwrap(setLenderRoomExpiry({ roomId, ...CHOSEN_EXPIRY_DAY })),
    ).rejects.toThrow('A selected room has no expiry');

    expect((await readRoom(roomId)).expires_at).toBeNull();
  });
});

describe('closeLenderRoom (integration)', () => {
  it('will not close until the team has told the lender', async () => {
    const roomId = await newRoom(await newDeal());

    await expect(unwrap(closeLenderRoom({ roomId }))).rejects.toThrow(
      'Tell First Bank the room is closing first',
    );
    expect((await readRoom(roomId)).closed_at).toBeNull();
  });

  it('gives the person starting a close one to-do on the deal, however often they start', async () => {
    const roomId = await newRoom(await newDeal());

    await unwrap(prepareLenderRoomClose({ roomId }));
    await unwrap(prepareLenderRoomClose({ roomId }));

    expect(await closingTodos(roomId)).toEqual([
      {
        user_id: owner.userId,
        title: 'Tell First Bank the room is closing',
        done: false,
      },
    ]);
  });

  it('refuses to start a close while the team is read-only', async () => {
    const roomId = await newRoom(await newDeal());
    const lockFor = async (days: number) =>
      admin
        .from('accounts')
        .update({
          trial_ends_at: new Date(Date.now() + days * 86_400_000).toISOString(),
        })
        .eq('id', teamAccountId)
        .throwOnError();

    await lockFor(-1);

    try {
      await expect(unwrap(prepareLenderRoomClose({ roomId }))).rejects.toThrow(
        'This team is read-only until billing is updated.',
      );
      expect(await closingTodos(roomId)).toEqual([]);
    } finally {
      await lockFor(30);
    }
  });

  it('closes once a closing to-do is ticked, and the next close needs a new one', async () => {
    const roomId = await newRoom(await newDeal());
    await toldLender(roomId);
    await unwrap(closeLenderRoom({ roomId }));
    await unwrap(reopenLenderRoom({ roomId }));

    await expect(unwrap(closeLenderRoom({ roomId }))).rejects.toThrow(
      'Tell First Bank the room is closing first',
    );
  });

  it('closes an open room as of now', async () => {
    const roomId = await newRoom(await newDeal());

    await toldLender(roomId);
    await unwrap(closeLenderRoom({ roomId }));

    expectWithinAMinuteOf((await readRoom(roomId)).closed_at, Date.now());
  });

  it('leaves expiry untouched when closing', async () => {
    const roomId = await newRoom(await newDeal());
    await unwrap(setLenderRoomExpiry({ roomId, ...CHOSEN_EXPIRY_DAY }));

    await toldLender(roomId);
    await unwrap(closeLenderRoom({ roomId }));

    expect(isoInstant((await readRoom(roomId)).expires_at)).toBe(CHOSEN_EXPIRY);
  });

  it('refuses to close a room that is already closed', async () => {
    const roomId = await newClosedRoom(await newDeal());
    const closed = await readRoom(roomId);

    await expect(unwrap(closeLenderRoom({ roomId }))).rejects.toThrow(
      'This room is already closed',
    );

    expect(await readRoom(roomId)).toEqual(closed);
  });
});

describe('reopenLenderRoom (integration)', () => {
  it('opens a closed room', async () => {
    const roomId = await newClosedRoom(await newDeal());

    await unwrap(reopenLenderRoom({ roomId }));

    expect((await readRoom(roomId)).closed_at).toBeNull();
  });

  it('gives a reopened closed room a fresh 60 days', async () => {
    const roomId = await newRoom(await newDeal());
    await unwrap(setLenderRoomExpiry({ roomId, ...CHOSEN_EXPIRY_DAY }));
    await toldLender(roomId);
    await unwrap(closeLenderRoom({ roomId }));

    await unwrap(reopenLenderRoom({ roomId }));

    expectSixtyDaysFromNow((await readRoom(roomId)).expires_at);
  });

  it('gives a room whose expiry has passed a fresh 60 days', async () => {
    const roomId = await newRoom(await newDeal());
    await unwrap(setLenderRoomExpiry({ roomId, ...PAST_EXPIRY_DAY }));

    await unwrap(reopenLenderRoom({ roomId }));

    const reopened = await readRoom(roomId);
    expect(reopened.closed_at).toBeNull();
    expectSixtyDaysFromNow(reopened.expires_at);
  });

  it('reopens a selected room without giving it an expiry', async () => {
    const roomId = await newRoom(await newDeal());
    await unwrap(setLenderRoomStatus({ roomId, status: 'selected' }));
    await toldLender(roomId);
    await unwrap(closeLenderRoom({ roomId }));

    await unwrap(reopenLenderRoom({ roomId }));

    expect(await readRoom(roomId)).toMatchObject({
      status: 'selected',
      closed_at: null,
      expires_at: null,
    });
  });

  it('refuses to reopen a room that is open', async () => {
    const roomId = await newRoom(await newDeal());
    await unwrap(setLenderRoomExpiry({ roomId, ...CHOSEN_EXPIRY_DAY }));
    const open = await readRoom(roomId);

    await expect(unwrap(reopenLenderRoom({ roomId }))).rejects.toThrow(
      'This room is already open',
    );

    expect(await readRoom(roomId)).toEqual(open);
  });
});

describe('setLenderRoomWelcomeNote (integration)', () => {
  it('sets the welcome note', async () => {
    const roomId = await newRoom(await newDeal());

    await unwrap(
      setLenderRoomWelcomeNote({
        roomId,
        welcomeNote: 'Start with the CIM',
      }),
    );

    expect((await readRoom(roomId)).welcome_note).toBe('Start with the CIM');
  });

  it('clears the welcome note when given none', async () => {
    const roomId = await newRoom(await newDeal());
    await unwrap(setLenderRoomWelcomeNote({ roomId, welcomeNote: 'Hello' }));

    await unwrap(setLenderRoomWelcomeNote({ roomId, welcomeNote: null }));

    expect((await readRoom(roomId)).welcome_note).toBeNull();
  });

  it('stores an empty welcome note as none', async () => {
    const roomId = await newRoom(await newDeal());
    await unwrap(setLenderRoomWelcomeNote({ roomId, welcomeNote: 'Hello' }));

    await unwrap(setLenderRoomWelcomeNote({ roomId, welcomeNote: '' }));

    expect((await readRoom(roomId)).welcome_note).toBeNull();
  });
});

describe('listLenderRooms (integration)', () => {
  it('lists the rooms of the given deal only', async () => {
    const dealId = await newDeal();
    caller.client = owner.client;
    const brandedId = await unwrap(
      createLenderRoom({
        dealId,
        name: 'First Bank',
        brandDomain: cachedBrandDomain,
      }),
    );
    const closedId = await newClosedRoom(dealId);
    await newRoom(await newDeal(), 'Elsewhere Bank');
    const branded = await readRoom(brandedId);
    const closed = await readRoom(closedId);

    const rooms = await unwrap(listLenderRooms({ dealId }));

    expect(rooms).toEqual([
      {
        id: brandedId,
        name: 'First Bank',
        status: 'invited',
        expires_at: branded.expires_at,
        closed_at: null,
        brand_domain: cachedBrandDomain,
      },
      {
        id: closedId,
        name: 'First Bank',
        status: 'invited',
        expires_at: closed.expires_at,
        closed_at: closed.closed_at,
        brand_domain: null,
      },
    ]);
  });

  it('lists rooms oldest first', async () => {
    const dealId = await newDeal();
    const firstId = await newRoom(dealId, 'First Bank');
    const secondId = await newRoom(dealId, 'Second Bank');
    const thirdId = await newRoom(dealId, 'Third Bank');
    await unwrap(setLenderRoomStatus({ roomId: firstId, status: 'reviewing' }));

    const rooms = await unwrap(listLenderRooms({ dealId }));

    expect(rooms.map((room) => room.id)).toEqual([firstId, secondId, thirdId]);
  });
});

describe('callers who do not manage the deal (integration)', () => {
  interface Target {
    dealId: string;
    openRoomId: string;
    closedRoomId: string;
  }

  const callers = [
    { label: 'a lender in the room', person: () => lender },
    { label: 'the owner of an unrelated account', person: () => outsider },
  ];

  const attempts: {
    action: string;
    run: (target: Target) => Promise<unknown>;
  }[] = [
    {
      action: 'create a room',
      run: ({ dealId }) =>
        unwrap(createLenderRoom({ dealId, name: 'Intruder Bank' })),
    },
    {
      action: 'set a status',
      run: ({ openRoomId }) =>
        unwrap(setLenderRoomStatus({ roomId: openRoomId, status: 'selected' })),
    },
    {
      action: 'set an expiry',
      run: ({ openRoomId }) =>
        unwrap(
          setLenderRoomExpiry({ roomId: openRoomId, ...CHOSEN_EXPIRY_DAY }),
        ),
    },
    {
      action: 'close a room',
      run: ({ openRoomId }) => unwrap(closeLenderRoom({ roomId: openRoomId })),
    },
    {
      action: 'reopen a room',
      run: ({ closedRoomId }) =>
        unwrap(reopenLenderRoom({ roomId: closedRoomId })),
    },
    {
      action: 'set a welcome note',
      run: ({ openRoomId }) =>
        unwrap(
          setLenderRoomWelcomeNote({
            roomId: openRoomId,
            welcomeNote: 'Hijacked',
          }),
        ),
    },
    {
      action: 'list rooms',
      run: ({ dealId }) => unwrap(listLenderRooms({ dealId })),
    },
  ];

  describe.each(callers)('$label', ({ person }) => {
    let target: Target;

    beforeAll(async () => {
      const dealId = await newDeal();
      target = {
        dealId,
        openRoomId: await newRoom(dealId),
        closedRoomId: await newClosedRoom(dealId),
      };

      await admin
        .from('lender_room_member')
        .insert(
          [target.openRoomId, target.closedRoomId].map((roomId) => ({
            room_id: roomId,
            user_id: lender.userId,
            email: lender.email,
            invited_by: owner.userId,
          })),
        )
        .throwOnError();
    });

    it.each(attempts)('may not $action', async ({ run }) => {
      const roomsBefore = await readDealRooms(target.dealId);
      const foldersBefore = await readDealFolders(target.dealId);
      caller.client = person().client;

      await expect(run(target)).rejects.toThrow();

      expect(await readDealRooms(target.dealId)).toEqual(roomsBefore);
      expect(await readDealFolders(target.dealId)).toEqual(foldersBefore);
    });
  });

  it('leaves no package or folders when an outsider tries to create the first room on a deal', async () => {
    const dealId = await newDeal();
    caller.client = outsider.client;

    await expect(
      unwrap(createLenderRoom({ dealId, name: 'Intruder Bank' })),
    ).rejects.toThrow();

    expect(await readDealFolders(dealId)).toEqual([]);
    expect(await readPackages(dealId)).toEqual([]);
  });
});
