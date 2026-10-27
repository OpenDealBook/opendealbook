import type { SupabaseClient } from '@supabase/supabase-js';

import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type { Database } from '@odb/supabase';

import {
  type IntegrationAccount,
  provisionAccount,
} from '../../../deals/test-support/integration-harness';
import { unwrap } from '../actions/test-support/unwrap';

const mockedClients = vi.hoisted(() => ({
  userScoped: null as unknown,
  serviceRole: null as unknown,
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => mockedClients.userScoped,
}));

vi.mock('@odb/supabase/admin', () => ({
  getSupabaseServerAdminClient: () => mockedClients.serviceRole,
}));

import { beginUpload, registerUpload } from '../uploads/actions';
import { hideForRoom, unhideForRoom } from './hide-actions';
import { getLastRoomVisit } from './last-visit';
import type {
  MarkedRoomEntry,
  MarkedRoomFolder,
  MarkedRoomListing,
  RoomEntry,
  RoomFolder,
  RoomListing,
} from './listing';
import { loadRoomListing } from './load-listing';
import { loadPackageListing } from './load-package';

let admin: SupabaseClient<Database>;
let owner: IntegrationAccount;
let lenderA: IntegrationAccount;
let lenderA2: IntegrationAccount;
let lenderAB: IntegrationAccount;
let lenderB: IntegrationAccount;
let rival: IntegrationAccount;
let addedBeforeLastVersions: string;
let baselineHiddenIds: string[];

const dealId = crypto.randomUUID();
const rivalDealId = crypto.randomUUID();
const roomA = crypto.randomUUID();
const roomB = crypto.randomUUID();
const closedRoom = crypto.randomUUID();
const rivalRoom = crypto.randomUUID();

const folders = {
  master: crypto.randomUUID(),
  financials: crypto.randomUUID(),
  withheld: crypto.randomUUID(),
  privateA: crypto.randomUUID(),
  privateB: crypto.randomUUID(),
  privateClosed: crypto.randomUUID(),
  diligence: crypto.randomUUID(),
  rivalMaster: crypto.randomUUID(),
  rivalPrivate: crypto.randomUUID(),
};

const documents = {
  cim1: crypto.randomUUID(),
  cim2: crypto.randomUUID(),
  secret1: crypto.randomUUID(),
  secret2: crypto.randomUUID(),
  pnl: crypto.randomUUID(),
  budget1: crypto.randomUUID(),
  budget2: crypto.randomUUID(),
  memo1: crypto.randomUUID(),
  memo2Removed: crypto.randomUUID(),
  memo3: crypto.randomUUID(),
  draft1: crypto.randomUUID(),
  draft2Removed: crypto.randomUUID(),
  inWithheld: crypto.randomUUID(),
  forA: crypto.randomUUID(),
  forB: crypto.randomUUID(),
  forClosed: crypto.randomUUID(),
  tax: crypto.randomUUID(),
};

const LENDER_A_NAMES = [
  'budget.xlsx',
  'cim.pdf',
  'draft.pdf',
  'for-a.pdf',
  'ledger-export.csv',
  'memo.pdf',
  'pnl.xlsx',
];

const pause = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

async function createDeal(id: string, account: IntegrationAccount) {
  const { data: firm } = await admin
    .from('firm')
    .insert({ account_id: account.accountId, name: 'Room contents deal' })
    .select('id')
    .single()
    .throwOnError();
  await admin
    .rpc('append_deal_event', {
      p_deal_id: id,
      p_aggregate_type: 'deal',
      p_aggregate_id: id,
      p_event_type: 'deal.created',
      p_payload: {
        firm_id: firm.id,
        account_id: account.accountId,
        description: 'Room contents deal',
      },
      p_actor_kind: 'service',
    })
    .throwOnError();
}

async function addDocument(
  id: string,
  folderId: string,
  name: string,
  version: number,
): Promise<void> {
  await admin
    .rpc('append_deal_event', {
      p_deal_id: dealId,
      p_aggregate_type: 'dr_document',
      p_aggregate_id: id,
      p_event_type: 'dr_document.added',
      p_payload: {
        folder_id: folderId,
        name,
        storage_path: `deal/${dealId}/${id}`,
        version,
      },
      p_actor_kind: 'service',
    })
    .throwOnError();
}

async function removeDocument(id: string): Promise<void> {
  await admin
    .rpc('append_deal_event', {
      p_deal_id: dealId,
      p_aggregate_type: 'dr_document',
      p_aggregate_id: id,
      p_event_type: 'dr_document.removed',
      p_actor_kind: 'service',
    })
    .throwOnError();
}

function entriesUnder(root: RoomFolder | null): RoomEntry[] {
  if (!root) {
    return [];
  }

  return [...root.entries, ...root.folders.flatMap(entriesUnder)];
}

function allEntries(listing: RoomListing): RoomEntry[] {
  return [...entriesUnder(listing.master), ...entriesUnder(listing.private)];
}

function names(listing: RoomListing): string[] {
  return allEntries(listing)
    .map((entry) => entry.name)
    .sort();
}

function fileNamed(listing: RoomListing, name: string) {
  const entry = allEntries(listing).find(
    (candidate) => candidate.name === name,
  );

  if (entry?.kind !== 'file') {
    throw new Error(`no file named ${name}`);
  }

  return entry;
}

function listFor(account: IntegrationAccount, roomId: string) {
  return loadRoomListing(account.user, { roomId, since: null });
}

async function teamListFor(roomId: string): Promise<MarkedRoomListing> {
  const listing = await listFor(owner, roomId);

  if (listing.viewer !== 'deal_team') {
    throw new Error('expected the deal team view');
  }

  return listing;
}

function markedEntriesUnder(root: MarkedRoomFolder | null): MarkedRoomEntry[] {
  if (!root) {
    return [];
  }

  return [...root.entries, ...root.folders.flatMap(markedEntriesUnder)];
}

async function hiddenRows(roomId: string) {
  const { data } = await admin
    .from('lender_room_hidden')
    .select('dr_folder_id, dr_document_id')
    .eq('room_id', roomId)
    .throwOnError();

  return data;
}

type Target = Parameters<typeof hideForRoom>[0]['target'];

function hide(account: IntegrationAccount, roomId: string, target: Target) {
  mockedClients.userScoped = account.user;

  return unwrap(hideForRoom({ roomId, target }));
}

function unhide(account: IntegrationAccount, roomId: string, target: Target) {
  mockedClients.userScoped = account.user;

  return unwrap(unhideForRoom({ roomId, target }));
}

beforeAll(async () => {
  [owner, lenderA, lenderA2, lenderAB, lenderB, rival] = await Promise.all([
    provisionAccount(),
    provisionAccount(),
    provisionAccount(),
    provisionAccount(),
    provisionAccount(),
    provisionAccount(),
  ]);
  admin = owner.admin;
  mockedClients.serviceRole = admin;

  const account_id = owner.accountId;

  await createDeal(dealId, owner);
  await createDeal(rivalDealId, rival);

  const folder = (id: string, parent_id: string | null, name: string) => ({
    id,
    account_id,
    deal_id: dealId,
    parent_id,
    name,
  });
  const rivalFolder = (id: string, name: string) => ({
    id,
    account_id: rival.accountId,
    deal_id: rivalDealId,
    name,
  });

  await admin
    .from('dr_folder')
    .insert([
      folder(folders.master, null, 'Lender package'),
      folder(folders.financials, folders.master, 'Financials'),
      folder(folders.withheld, folders.master, 'Withheld from A'),
      folder(folders.privateA, null, 'Room A'),
      folder(folders.privateB, null, 'Room B'),
      folder(folders.privateClosed, null, 'Closed room'),
      folder(folders.diligence, null, 'Diligence'),
    ])
    .throwOnError();
  await admin
    .from('dr_folder')
    .insert([
      rivalFolder(folders.rivalMaster, 'Lender package'),
      rivalFolder(folders.rivalPrivate, 'Rival room'),
    ])
    .throwOnError();

  await addDocument(documents.cim1, folders.master, 'cim.pdf', 1);
  await addDocument(documents.secret1, folders.master, 'secret.pdf', 1);
  await addDocument(documents.secret2, folders.master, 'secret.pdf', 2);
  await addDocument(documents.memo1, folders.master, 'memo.pdf', 1);
  await addDocument(documents.memo2Removed, folders.master, 'memo.pdf', 2);
  await addDocument(documents.memo3, folders.master, 'memo.pdf', 3);
  await addDocument(documents.draft1, folders.master, 'draft.pdf', 1);
  await addDocument(documents.draft2Removed, folders.master, 'draft.pdf', 2);
  await addDocument(documents.pnl, folders.financials, 'pnl.xlsx', 1);
  await addDocument(documents.budget1, folders.financials, 'budget.xlsx', 1);
  await addDocument(documents.budget2, folders.financials, 'budget.xlsx', 2);
  await addDocument(documents.inWithheld, folders.withheld, 'withheld.pdf', 1);
  await addDocument(documents.forA, folders.privateA, 'for-a.pdf', 1);
  await addDocument(documents.forB, folders.privateB, 'for-b.pdf', 1);
  await addDocument(
    documents.forClosed,
    folders.privateClosed,
    'closed-room.pdf',
    1,
  );
  await addDocument(documents.tax, folders.diligence, 'tax-return.pdf', 1);
  await removeDocument(documents.memo2Removed);
  await removeDocument(documents.draft2Removed);

  await pause(1000);
  addedBeforeLastVersions = new Date().toISOString();
  await pause(1000);
  await addDocument(documents.cim2, folders.master, 'cim.pdf', 2);

  const oversize = (dr_folder_id: string, name: string) => ({
    account_id,
    dr_folder_id,
    name,
    size_bytes: 400 * 1024 * 1024,
  });

  await admin
    .from('lender_oversize_file')
    .insert([
      oversize(folders.financials, 'ledger-export.csv'),
      oversize(folders.withheld, 'big-withheld.bin'),
      oversize(folders.privateB, 'big-b.bin'),
      oversize(folders.diligence, 'big-diligence.bin'),
    ])
    .throwOnError();

  await admin
    .from('lender_package')
    .insert([
      { deal_id: dealId, account_id, master_folder_id: folders.master },
      {
        deal_id: rivalDealId,
        account_id: rival.accountId,
        master_folder_id: folders.rivalMaster,
      },
    ])
    .throwOnError();

  const room = (id: string, name: string, private_folder_id: string) => ({
    id,
    account_id,
    deal_id: dealId,
    name,
    private_folder_id,
  });

  await admin
    .from('lender_room')
    .insert([
      room(roomA, 'Lender A', folders.privateA),
      room(roomB, 'Lender B', folders.privateB),
      {
        ...room(closedRoom, 'Closed lender', folders.privateClosed),
        closed_at: new Date().toISOString(),
      },
      {
        id: rivalRoom,
        account_id: rival.accountId,
        deal_id: rivalDealId,
        name: 'Rival lender',
        private_folder_id: folders.rivalPrivate,
      },
    ])
    .throwOnError();

  await admin
    .from('lender_room_member')
    .insert([
      { room_id: roomA, user_id: lenderA.userId, email: 'a@lender.test' },
      { room_id: roomA, user_id: lenderA2.userId, email: 'a2@lender.test' },
      { room_id: roomA, user_id: lenderAB.userId, email: 'ab@lender.test' },
      { room_id: roomB, user_id: lenderAB.userId, email: 'ab@lender.test' },
      { room_id: closedRoom, user_id: lenderA.userId, email: 'a@lender.test' },
      { room_id: roomB, user_id: lenderB.userId, email: 'b@lender.test' },
    ])
    .throwOnError();

  const { data: baseline } = await admin
    .from('lender_room_hidden')
    .insert([
      { room_id: roomA, dr_folder_id: folders.withheld },
      { room_id: roomA, dr_document_id: documents.secret1 },
    ])
    .select('id')
    .throwOnError();

  baselineHiddenIds = baseline.map((row) => row.id);
});

afterAll(async () => {
  await admin
    .from('lender_room')
    .delete()
    .in('id', [roomA, roomB, closedRoom, rivalRoom])
    .throwOnError();

  for (const account of [owner, lenderA, lenderA2, lenderAB, lenderB, rival]) {
    const { error } = await admin.auth.admin.deleteUser(account.userId);

    if (error) {
      throw error;
    }
  }
});

describe('loadRoomListing (integration)', () => {
  it('lists the master package and the room files for a lender', async () => {
    expect(names(await listFor(lenderA, roomA))).toEqual(LENDER_A_NAMES);
  });

  it("leaves another room's files out of a lender's listing", async () => {
    expect(names(await listFor(lenderA, roomA))).not.toContain('for-b.pdf');
  });

  it('leaves data room content outside the master package out of a lender listing', async () => {
    expect(names(await listFor(lenderA, roomA))).not.toContain(
      'tax-return.pdf',
    );
  });

  it('leaves a hidden folder out of a lender listing', async () => {
    const listing = await listFor(lenderA, roomA);

    expect(listing.master?.folders.map((folder) => folder.name)).toEqual([
      'Financials',
    ]);
  });

  it('leaves the files of a hidden folder out of a lender listing', async () => {
    expect(names(await listFor(lenderA, roomA))).not.toContain('withheld.pdf');
  });

  it('leaves every version of a hidden document out of a lender listing', async () => {
    const versionIds = allEntries(await listFor(lenderA, roomA)).flatMap(
      (entry) =>
        entry.kind === 'file'
          ? [entry, ...entry.earlierVersions].map(
              (version) => version.documentId,
            )
          : [],
    );

    expect(versionIds).not.toContain(documents.secret1);
    expect(versionIds).not.toContain(documents.secret2);
  });

  it('leaves a removed version out of the earlier versions', async () => {
    const memo = fileNamed(await listFor(lenderA, roomA), 'memo.pdf');

    expect([memo, ...memo.earlierVersions].map((v) => v.documentId)).toEqual([
      documents.memo3,
      documents.memo1,
    ]);
  });

  it('shows the newest remaining version when the latest was removed', async () => {
    const draft = fileNamed(await listFor(lenderA, roomA), 'draft.pdf');

    expect([draft, ...draft.earlierVersions].map((v) => v.documentId)).toEqual([
      documents.draft1,
    ]);
  });

  it.each(['big-withheld.bin', 'big-b.bin', 'big-diligence.bin'])(
    'leaves the oversize placeholder %s out of a lender listing that cannot reach its folder',
    async (name) => {
      expect(names(await listFor(lenderA, roomA))).not.toContain(name);
    },
  );

  it('shows another room what room A hides', async () => {
    expect(names(await listFor(lenderB, roomB))).toEqual(
      expect.arrayContaining(['secret.pdf', 'withheld.pdf']),
    );
  });

  it('leaves a file hidden for this room out for a person who can read it through another room', async () => {
    expect(names(await listFor(lenderAB, roomA))).not.toContain('secret.pdf');
  });

  it('leaves a folder hidden for this room out for a person who can read it through another room', async () => {
    expect(names(await listFor(lenderAB, roomA))).not.toContain('withheld.pdf');
  });

  it('shows a person in two rooms the file in the room that does not hide it', async () => {
    expect(names(await listFor(lenderAB, roomB))).toContain('secret.pdf');
  });

  it("leaves another room's own files out for a person in both rooms", async () => {
    expect(names(await listFor(lenderAB, roomA))).not.toContain('for-b.pdf');
  });

  it('gives a lender a listing without hide marks', async () => {
    expect(JSON.stringify(await listFor(lenderA, roomA))).not.toContain(
      '"hidden"',
    );
  });

  it('rejects a lender asking for a room they do not belong to', async () => {
    await expect(listFor(lenderA, roomB)).rejects.toThrow();
  });

  it('gives a lender member of a closed room an empty listing', async () => {
    expect(await listFor(lenderA, closedRoom)).toEqual({
      viewer: 'lender',
      master: null,
      private: null,
    });
  });

  it('gives our team the full listing of a closed room', async () => {
    expect(names(await listFor(owner, closedRoom))).toEqual([
      'big-withheld.bin',
      'budget.xlsx',
      'cim.pdf',
      'closed-room.pdf',
      'draft.pdf',
      'ledger-export.csv',
      'memo.pdf',
      'pnl.xlsx',
      'secret.pdf',
      'withheld.pdf',
    ]);
  });

  it('restricts our team to the master package and the room folder', async () => {
    expect(names(await listFor(owner, roomA))).toEqual(
      [
        ...LENDER_A_NAMES,
        'big-withheld.bin',
        'secret.pdf',
        'withheld.pdf',
      ].sort(),
    );
  });

  it('tells our team which files are hidden for the room and how', async () => {
    const listing = await teamListFor(roomA);

    expect(
      Object.fromEntries(
        markedEntriesUnder(listing.master).flatMap((entry) =>
          entry.kind === 'file' ? [[entry.name, entry.hidden]] : [],
        ),
      ),
    ).toEqual({
      'budget.xlsx': { direct: false, inherited: false },
      'cim.pdf': { direct: false, inherited: false },
      'draft.pdf': { direct: false, inherited: false },
      'memo.pdf': { direct: false, inherited: false },
      'pnl.xlsx': { direct: false, inherited: false },
      'secret.pdf': { direct: true, inherited: false },
      'withheld.pdf': { direct: false, inherited: true },
    });
  });

  it('tells our team which folders are hidden for the room', async () => {
    const listing = await teamListFor(roomA);

    expect(
      listing.master?.folders.map((folder) => [folder.name, folder.hidden]),
    ).toEqual([
      ['Financials', { direct: false, inherited: false }],
      ['Withheld from A', { direct: true, inherited: false }],
    ]);
  });

  it('marks only files whose latest version arrived after the given time as new', async () => {
    const listing = await loadRoomListing(lenderA.user, {
      roomId: roomA,
      since: addedBeforeLastVersions,
    });

    expect(
      Object.fromEntries(
        allEntries(listing).flatMap((entry) =>
          entry.kind === 'file' ? [[entry.name, entry.visitMark]] : [],
        ),
      ),
    ).toEqual({
      'budget.xlsx': 'seen',
      'cim.pdf': 'new',
      'draft.pdf': 'seen',
      'for-a.pdf': 'seen',
      'memo.pdf': 'seen',
      'pnl.xlsx': 'seen',
    });
  });
});

describe('hideForRoom and unhideForRoom (integration)', () => {
  const pnl = { kind: 'document', id: documents.pnl } as const;
  const financials = { kind: 'folder', id: folders.financials } as const;
  const notDealTeam = 'Only the deal team can hide or unhide room items';
  const notMaster = 'Only master package items can be hidden';

  afterEach(async () => {
    await admin
      .from('lender_room_hidden')
      .delete()
      .eq('room_id', roomA)
      .not('id', 'in', `(${baselineHiddenIds.join(',')})`)
      .throwOnError();
  });

  it('hides a master document from the room', async () => {
    await hide(owner, roomA, pnl);

    expect(names(await listFor(lenderA, roomA))).not.toContain('pnl.xlsx');
  });

  it('leaves a document hidden for one room visible in another', async () => {
    await hide(owner, roomA, pnl);

    expect(names(await listFor(lenderB, roomB))).toContain('pnl.xlsx');
  });

  it('keeps one hide when a document is hidden twice', async () => {
    await hide(owner, roomA, pnl);
    await hide(owner, roomA, pnl);

    expect(
      (await hiddenRows(roomA)).filter(
        (row) => row.dr_document_id === documents.pnl,
      ),
    ).toHaveLength(1);
  });

  it('brings a document back when it is unhidden', async () => {
    await hide(owner, roomA, pnl);
    await unhide(owner, roomA, pnl);

    expect(names(await listFor(lenderA, roomA))).toContain('pnl.xlsx');
  });

  it('hides a master folder and everything in it from the room', async () => {
    await hide(owner, roomA, financials);

    expect(names(await listFor(lenderA, roomA))).toEqual([
      'cim.pdf',
      'draft.pdf',
      'for-a.pdf',
      'memo.pdf',
    ]);
  });

  it('keeps one hide when a folder is hidden twice', async () => {
    await hide(owner, roomA, financials);
    await hide(owner, roomA, financials);

    expect(
      (await hiddenRows(roomA)).filter(
        (row) => row.dr_folder_id === folders.financials,
      ),
    ).toHaveLength(1);
  });

  it('brings a folder back when it is unhidden', async () => {
    await hide(owner, roomA, financials);
    await unhide(owner, roomA, financials);

    expect(names(await listFor(lenderA, roomA))).toEqual(LENDER_A_NAMES);
  });

  it('clears a hide through any version of the file', async () => {
    await hide(owner, roomA, { kind: 'document', id: documents.budget1 });
    await unhide(owner, roomA, { kind: 'document', id: documents.budget2 });

    expect(names(await listFor(lenderA, roomA))).toContain('budget.xlsx');
  });

  it('keeps one hide when a file is hidden again through a version uploaded since', async () => {
    const budget3 = crypto.randomUUID();

    await hide(owner, roomA, { kind: 'document', id: documents.budget2 });
    await addDocument(budget3, folders.financials, 'budget.xlsx', 3);
    await hide(owner, roomA, { kind: 'document', id: budget3 });

    expect(
      (await hiddenRows(roomA)).filter((row) =>
        [documents.budget1, documents.budget2, budget3].includes(
          row.dr_document_id ?? '',
        ),
      ),
    ).toHaveLength(1);
  });

  it('refuses to hide anything outside the master package', async () => {
    const before = await hiddenRows(roomA);

    for (const target of [
      { kind: 'document', id: documents.forA },
      { kind: 'document', id: documents.tax },
      { kind: 'folder', id: folders.privateA },
      { kind: 'folder', id: folders.diligence },
    ] as const) {
      await expect(hide(owner, roomA, target)).rejects.toThrow(notMaster);
    }

    expect(await hiddenRows(roomA)).toEqual(before);
  });

  it('refuses to hide the whole lender package', async () => {
    const before = await hiddenRows(roomA);

    await expect(
      hide(owner, roomA, { kind: 'folder', id: folders.master }),
    ).rejects.toThrow(
      'The whole lender package cannot be hidden; close the room instead',
    );

    expect(await hiddenRows(roomA)).toEqual(before);
  });

  it("refuses to hide another deal's items in a room the caller manages", async () => {
    await expect(
      hide(rival, rivalRoom, { kind: 'document', id: documents.cim2 }),
    ).rejects.toThrow(notMaster);
    await expect(hide(rival, rivalRoom, financials)).rejects.toThrow(notMaster);

    expect(await hiddenRows(rivalRoom)).toEqual([]);
  });

  it('does nothing when our team unhides something that is not hidden', async () => {
    const before = await hiddenRows(roomA);

    await unhide(owner, roomA, { kind: 'document', id: documents.cim2 });

    expect(await hiddenRows(roomA)).toEqual(before);
  });

  it('does nothing when our team unhides something outside the master package', async () => {
    const before = await hiddenRows(roomA);

    await unhide(owner, roomA, { kind: 'document', id: documents.tax });
    await unhide(owner, roomA, { kind: 'folder', id: folders.diligence });

    expect(await hiddenRows(roomA)).toEqual(before);
  });

  it('refuses a lender who tries to hide', async () => {
    await expect(hide(lenderA, roomA, pnl)).rejects.toThrow(notDealTeam);
  });

  it('refuses a lender who tries to unhide with the same error', async () => {
    await expect(
      unhide(lenderA, roomA, { kind: 'folder', id: folders.withheld }),
    ).rejects.toThrow(notDealTeam);
  });

  it('changes no hides when a lender is refused', async () => {
    const before = await hiddenRows(roomA);

    await Promise.allSettled([
      hide(lenderA, roomA, pnl),
      hide(lenderA, roomA, financials),
      unhide(lenderA, roomA, { kind: 'folder', id: folders.withheld }),
      unhide(lenderA, roomA, { kind: 'document', id: documents.secret1 }),
    ]);

    expect(await hiddenRows(roomA)).toEqual(before);
  });
});

describe('getLastRoomVisit (integration)', () => {
  const MINUTE = 60 * 1000;
  const DAY = 24 * 60 * MINUTE;
  const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
  const threeDaysAgo = ago(3 * DAY);
  const yesterday = ago(DAY);
  const twoDaysAgo = ago(2 * DAY);

  beforeAll(async () => {
    const activity = (
      room_id: string,
      account: IntegrationAccount,
      action: 'room_opened' | 'document_downloaded',
      created_at: string,
    ) => ({
      room_id,
      account_id: owner.accountId,
      user_id: account.userId,
      side: account === owner ? ('internal' as const) : ('lender' as const),
      action,
      created_at,
    });

    await admin
      .from('lender_room_activity')
      .insert([
        activity(roomA, lenderA, 'room_opened', threeDaysAgo),
        activity(roomA, lenderA, 'room_opened', yesterday),
        activity(roomA, lenderA, 'document_downloaded', ago(2 * 60 * MINUTE)),
        activity(roomA, lenderA, 'room_opened', ago(5 * MINUTE)),
        activity(roomA, owner, 'room_opened', twoDaysAgo),
        activity(roomA, owner, 'room_opened', ago(5 * MINUTE)),
        activity(roomB, lenderB, 'room_opened', ago(5 * MINUTE)),
        activity(roomB, owner, 'room_opened', threeDaysAgo),
      ])
      .throwOnError();
  });

  const at = (iso: string | null) => (iso === null ? null : Date.parse(iso));

  it("returns a lender's own latest room open from before the current visit", async () => {
    expect(at(await getLastRoomVisit(lenderA.user, roomA))).toBe(
      Date.parse(yesterday),
    );
  });

  it('returns nothing when the only room open is five minutes old', async () => {
    expect(await getLastRoomVisit(lenderB.user, roomB)).toBeNull();
  });

  it("returns an internal user's own latest room open from before the current visit", async () => {
    expect(at(await getLastRoomVisit(owner.user, roomA))).toBe(
      Date.parse(twoDaysAgo),
    );
  });

  it('keeps the visits of different rooms apart', async () => {
    expect(at(await getLastRoomVisit(owner.user, roomB))).toBe(
      Date.parse(threeDaysAgo),
    );
  });

  it('returns nothing for a room the lender does not belong to', async () => {
    expect(await getLastRoomVisit(lenderA.user, roomB)).toBeNull();
  });
});

describe('own uploads in loadRoomListing (integration)', () => {
  let storedPath: string;

  const markOfUploadFor = async (account: IntegrationAccount) => {
    const listing = await loadRoomListing(account.user, {
      roomId: roomA,
      since: addedBeforeLastVersions,
    });

    return fileNamed(listing, 'our-form.pdf').visitMark;
  };

  beforeAll(async () => {
    const bytes = new TextEncoder().encode('form');

    mockedClients.userScoped = lenderA.user;

    const upload = await unwrap(
      beginUpload({
        roomId: roomA,
        folderId: folders.privateA,
        name: 'our-form.pdf',
        size: bytes.length,
      }),
    );
    const stored = await lenderA.user.storage
      .from('data-room')
      .uploadToSignedUrl(upload.path, upload.token, bytes);

    if (stored.error) {
      throw stored.error;
    }

    storedPath = upload.path;
    await unwrap(
      registerUpload({ uploadId: upload.uploadId, keepAsZip: false }),
    );
  });

  afterAll(async () => {
    const removed = await admin.storage.from('data-room').remove([storedPath]);

    if (removed.error) {
      throw removed.error;
    }
  });

  it('marks a file as seen for the lender who uploaded it', async () => {
    expect(await markOfUploadFor(lenderA)).toBe('seen');
  });

  it('marks the same file as new for a colleague in the room', async () => {
    expect(await markOfUploadFor(lenderA2)).toBe('new');
  });
});

describe('loadPackageListing (integration)', () => {
  const noPackageDealId = crypto.randomUUID();

  const packageFor = (account: IntegrationAccount, forDealId: string) => {
    mockedClients.userScoped = account.user;

    return loadPackageListing(account.user, forDealId);
  };

  beforeAll(async () => {
    await createDeal(noPackageDealId, owner);
  });

  it('gives a deal manager the package folder tree', async () => {
    const lenderPackage = await packageFor(owner, dealId);

    expect(lenderPackage?.name).toBe('Lender package');
    expect(lenderPackage?.folders.map((folder) => folder.name)).toEqual([
      'Financials',
      'Withheld from A',
    ]);
    expect(
      lenderPackage?.folders[0]?.entries.map((entry) => entry.name),
    ).toEqual(['budget.xlsx', 'ledger-export.csv', 'pnl.xlsx']);
  });

  it('gives a deal manager every package file, whatever any room hides, sorted by name', async () => {
    const lenderPackage = await packageFor(owner, dealId);

    expect(lenderPackage?.entries.map((entry) => entry.name)).toEqual([
      'cim.pdf',
      'draft.pdf',
      'memo.pdf',
      'secret.pdf',
    ]);
  });

  it('gives a deal manager each file with its earlier versions newest first', async () => {
    const lenderPackage = await packageFor(owner, dealId);
    const memo = lenderPackage?.entries.find(
      (entry) => entry.name === 'memo.pdf',
    );

    expect(
      memo?.kind === 'file' &&
        [memo, ...memo.earlierVersions].map((version) => version.documentId),
    ).toEqual([documents.memo3, documents.memo1]);
  });

  it('carries no room hide marks', async () => {
    expect(JSON.stringify(await packageFor(owner, dealId))).not.toContain(
      '"hidden"',
    );
  });

  it('gives null for a deal with no package yet', async () => {
    expect(await packageFor(owner, noPackageDealId)).toBeNull();
  });

  it('gives a lender nothing', async () => {
    expect(await packageFor(lenderA, dealId)).toBeNull();
  });

  it('gives someone who manages a different deal nothing', async () => {
    expect(await packageFor(rival, dealId)).toBeNull();
  });
});
