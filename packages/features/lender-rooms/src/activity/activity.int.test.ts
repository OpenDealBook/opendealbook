import { createClient } from '@supabase/supabase-js';
import { unzipSync } from 'fflate';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { DATA_ROOM_BUCKET } from '@odb/data-room/storage';
import { appendDealEvent } from '@odb/events';

import {
  type IntegrationAccount,
  provisionAccount,
} from '../../../deals/test-support/integration-harness';
import { respondToDocumentRequest } from './document-access';
import { respondToPackageDocumentRequest } from './package-document-access';
import { fetchRoomActivity, fetchSeenBy } from './queries';
import { recordActivity, recordFolderActivity } from './record-activity';
import { signedInUser } from './signed-in-user';
import { respondToZipRequest } from './zip-download';

const requestClients = vi.hoisted(() => ({
  client: null as unknown,
  admin: null as unknown,
}));

vi.mock('@odb/supabase/server', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getSupabaseServerClient: () => requestClients.client,
}));

vi.mock('@odb/supabase/admin', () => ({
  getSupabaseServerAdminClient: () => requestClients.admin,
}));

vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const HOST = 'odb.test';
const ORIGIN = `http://${HOST}`;

const HEIC_SAMPLE = Uint8Array.from(
  Buffer.from(
    'AAAAJGZ0eXBoZWljAAAAAG1pZjFNaVBybWlhZk1pSEJoZWljAAABhm1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAHBpY3QAAAAAAAAAAAAAAAAAAAAAJGRpbmYAAAAcZHJlZgAAAAAAAAABAAAADHVybCAAAAABAAAADnBpdG0AAAAAAAEAAAAjaWluZgAAAAAAAQAAABVpbmZlAgAAAAABAABodmMxAAAAAOZpcHJwAAAAxWlwY28AAAATY29scm5jbHgAAgACAAaAAAAADGNsbGkAywBAAAAAFGlzcGUAAAAAAAAAEAAAABAAAAAJaXJvdAAAAAAQcGl4aQAAAAADCAgIAAAAcWh2Y0MBA3AAAACwAAAAAAAe8AD8/fj4AAALA6AAAQAXQAEMAf//A3AAAAMAsAAAAwAAAwAecCShAAEAI0IBAQNwAAADALAAAAMAAAMAHqAUIEHAkwziHuRZVNwICBgCogABAAlEAcBhcshAUyQAAAAZaXBtYQAAAAAAAAABAAEGgQIDBYaEAAAAHmlsb2MAAAAARAAAAQABAAAAAQAAAboAAAA8AAAAAW1kYXQAAAAAAAAATAAAADgoAa+jVyq0//uP//pu7LpGtUf/1Wp//ezf/2vFV3/6XT79Wvf7YA7O/7/vppoS01HCM8ULq1Lu4A==',
    'base64',
  ),
);

type Client = IntegrationAccount['user'];

let owner: IntegrationAccount;
let lender: IntegrationAccount;
let outsider: IntegrationAccount;
let signedOut: IntegrationAccount;
let deleted: IntegrationAccount;
let admin: IntegrationAccount['admin'];
let dealId: string;
let ownerEmail: string;
let lenderEmail: string;
let masterFolderId: string;
let cim: StoredDocument;
let pnl: StoredDocument;
const storedPaths: string[] = [];

interface StoredDocument {
  id: string;
  name: string;
  storagePath: string;
  body: string;
}

interface Room {
  id: string;
  privateFolderId: string;
  privateFolderName: string;
}

async function clientWhoseAuthServer(
  account: IntegrationAccount,
  answerUserRequest: () => Promise<Response>,
): Promise<Client> {
  const client: Client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        String(input instanceof Request ? input.url : input).endsWith(
          '/auth/v1/user',
        ) && authServerReplaced
          ? answerUserRequest()
          : fetch(input, init),
    },
  });
  let authServerReplaced = false;
  const { data } = await account.user.auth.getSession();

  await client.auth.setSession(data.session!);
  authServerReplaced = true;

  return client;
}

async function emailOf(account: IntegrationAccount): Promise<string> {
  const { data } = await admin.auth.admin.getUserById(account.userId);

  return data.user!.email!;
}

async function addFolder(name: string, parentId?: string): Promise<string> {
  const { data } = await owner.user
    .from('dr_folder')
    .insert({
      account_id: owner.accountId,
      deal_id: dealId,
      name,
      parent_id: parentId,
    })
    .select('id')
    .single()
    .throwOnError();

  return data.id;
}

async function store(
  path: string,
  body: string | Uint8Array<ArrayBuffer>,
): Promise<void> {
  const { error } = await admin.storage
    .from(DATA_ROOM_BUCKET)
    .upload(path, new Blob([body]));

  if (error) {
    throw error;
  }

  storedPaths.push(path);
}

async function addDocument(
  folderId: string,
  name: string,
): Promise<StoredDocument> {
  const document = await addDocumentRow(folderId, name);

  await store(document.storagePath, document.body);

  return document;
}

async function addDocumentRow(
  folderId: string,
  name: string,
): Promise<StoredDocument> {
  const id = crypto.randomUUID();
  const storagePath = `deal/${dealId}/${crypto.randomUUID()}`;
  const body = `bytes of ${name} ${id}`;

  await appendDealEvent(owner.user, {
    dealId,
    aggregateType: 'dr_document',
    aggregateId: id,
    eventType: 'dr_document.added',
    payload: { folder_id: folderId, name, storage_path: storagePath, version: 1 },
  });

  return { id, name, storagePath, body };
}

async function removeDocument(document: StoredDocument): Promise<void> {
  await appendDealEvent(owner.user, {
    dealId,
    aggregateType: 'dr_document',
    aggregateId: document.id,
    eventType: 'dr_document.removed',
    payload: {},
  });
}

async function newRoom(): Promise<Room> {
  const privateFolderName = `Room ${crypto.randomUUID()}`;
  const privateFolderId = await addFolder(privateFolderName);
  const { data } = await admin
    .from('lender_room')
    .insert({
      account_id: owner.accountId,
      deal_id: dealId,
      name: 'First Bank & Trust',
      private_folder_id: privateFolderId,
    })
    .select('id')
    .single()
    .throwOnError();

  await admin
    .from('lender_room_member')
    .insert({
      room_id: data.id,
      user_id: lender.userId,
      email: lenderEmail,
      invited_by: owner.userId,
    })
    .throwOnError();

  return { id: data.id, privateFolderId, privateFolderName };
}

async function closedRoom(): Promise<Room> {
  const room = await newRoom();

  await admin
    .from('lender_room')
    .update({ closed_at: new Date().toISOString() })
    .eq('id', room.id)
    .throwOnError();

  return room;
}

async function hide(
  room: Room,
  target: { dr_document_id: string } | { dr_folder_id: string },
): Promise<void> {
  await admin
    .from('lender_room_hidden')
    .insert({ room_id: room.id, ...target })
    .throwOnError();
}

async function activityIn(roomId: string) {
  const { data } = await admin
    .from('lender_room_activity')
    .select('user_id, side, action, dr_document_id, dr_folder_id, payload, created_at')
    .eq('room_id', roomId)
    .order('created_at')
    .throwOnError();

  return data;
}

async function unzipped(response: Response): Promise<Record<string, string>> {
  const files = unzipSync(new Uint8Array(await response.arrayBuffer()));

  return Object.fromEntries(
    Object.entries(files).map(([name, bytes]) => [
      name,
      new TextDecoder().decode(bytes),
    ]),
  );
}

function getDocument(
  room: Room,
  documentId: string,
  {
    client = lender.user,
    query = '?disposition=preview',
    headers = {},
  }: { client?: Client; query?: string; headers?: Record<string, string> } = {},
): Promise<Response> {
  return respondToDocumentRequest({
    client,
    admin,
    request: new Request(
      `${ORIGIN}/lender/${room.id}/files/${documentId}${query}`,
      { headers },
    ),
    roomId: room.id,
    documentId,
  });
}

function zipForm(documentIds: string[]): FormData {
  const form = new FormData();

  for (const documentId of documentIds) {
    form.append('documentIds', documentId);
  }

  return form;
}

function postZip(
  room: Room,
  documentIds: string[],
  {
    client = lender.user,
    headers = { origin: ORIGIN, host: HOST },
    body = zipForm(documentIds),
  }: {
    client?: Client;
    headers?: Record<string, string>;
    body?: BodyInit;
  } = {},
): Promise<Response> {
  return respondToZipRequest({
    client,
    admin,
    request: new Request(`${ORIGIN}/lender/${room.id}/files/zip`, {
      method: 'POST',
      headers,
      body,
    }),
    roomId: room.id,
  });
}

async function fetchSignedFile(redirect: Response): Promise<Response> {
  const response = await fetch(redirect.headers.get('location')!);

  expect(response.status).toBe(200);

  return response;
}

async function expectDocumentRefused(
  room: Room,
  documentId: string,
): Promise<void> {
  const statuses = [
    (await getDocument(room, documentId)).status,
    (await getDocument(room, documentId, { query: '?disposition=download' }))
      .status,
  ];

  expect(statuses).toEqual([404, 404]);
  expect(await activityIn(room.id)).toEqual([]);
}

async function expectZipRefused(
  room: Room,
  documentIds: string[],
): Promise<void> {
  expect((await postZip(room, documentIds)).status).toBe(404);
  expect(await activityIn(room.id)).toEqual([]);
}

async function openRequest(
  room: Room,
  kind: 'ask' | 'form',
  title: string,
  by: IntegrationAccount = lender,
): Promise<string> {
  const { data } = await admin
    .from('lender_ask')
    .insert({
      room_id: room.id,
      account_id: owner.accountId,
      kind,
      title,
      body: 'Opening words',
      return_route: kind === 'form' ? 'upload' : null,
      created_by: by.userId,
    })
    .select('id')
    .single()
    .throwOnError();

  return data.id;
}

async function replyAsLender(askId: string): Promise<void> {
  await admin
    .from('lender_ask_message')
    .insert({
      ask_id: askId,
      author_user_id: lender.userId,
      side: 'lender',
      body: 'From the lender',
    })
    .throwOnError();
}

async function replyAsTeam(askId: string): Promise<void> {
  await owner.user
    .from('lender_ask_message')
    .insert({ ask_id: askId, side: 'internal', body: 'From us' })
    .throwOnError();
}

async function attach(
  askId: string,
  document: StoredDocument,
  role: 'attachment' | 'blank_form' | 'fulfilment' | 'signed_form',
  addedBy: string | null = lender.userId,
): Promise<string> {
  const { data } = await admin
    .from('lender_ask_file')
    .insert({
      ask_id: askId,
      dr_document_id: document.id,
      role,
      added_by: addedBy,
    })
    .select('id')
    .single()
    .throwOnError();

  return data.id;
}

async function openFormWithBlank(room: Room): Promise<string> {
  const formId = await openRequest(room, 'form', 'Loan application');

  await attach(
    formId,
    await uploadAsLender(room.privateFolderId, 'blank-application.pdf'),
    'blank_form',
  );

  return formId;
}

async function uploadAsLender(
  folderId: string,
  name: string,
  by: IntegrationAccount = lender,
): Promise<StoredDocument> {
  const id = crypto.randomUUID();
  const storagePath = `deal/${dealId}/${crypto.randomUUID()}`;

  await appendDealEvent(admin, {
    dealId,
    aggregateType: 'dr_document',
    aggregateId: id,
    eventType: 'dr_document.added',
    actorKind: 'service',
    payload: {
      folder_id: folderId,
      name,
      storage_path: storagePath,
      version: 1,
      uploaded_by: by.userId,
    },
  });

  return { id, name, storagePath, body: '' };
}

async function addMember(room: Room, account: IntegrationAccount) {
  await admin
    .from('lender_room_member')
    .insert({
      room_id: room.id,
      user_id: account.userId,
      email: await emailOf(account),
      invited_by: owner.userId,
    })
    .throwOnError();
}

async function removeMember(room: Room, account: IntegrationAccount) {
  await admin
    .from('lender_room_member')
    .delete()
    .eq('room_id', room.id)
    .eq('user_id', account.userId)
    .throwOnError();
}

async function nameOutsider(): Promise<void> {
  await admin
    .from('lender_person')
    .upsert({ user_id: outsider.userId, name: 'Dana Reyes' })
    .throwOnError();
}

async function composedEntries(room: Room) {
  const entries = await fetchRoomActivity(owner.user, room.id);

  return entries.filter((entry) => entry.kind !== 'recorded');
}

beforeAll(async () => {
  [owner, lender, outsider, signedOut, deleted] = await Promise.all([
    provisionAccount(),
    provisionAccount(),
    provisionAccount(),
    provisionAccount(),
    provisionAccount(),
  ]);
  await signedOut.user.auth.signOut();
  await deleted.cleanup();
  admin = owner.admin;
  ownerEmail = await emailOf(owner);
  lenderEmail = await emailOf(lender);
  dealId = crypto.randomUUID();

  await appendDealEvent(owner.user, {
    dealId,
    aggregateType: 'deal',
    aggregateId: dealId,
    eventType: 'deal.created',
    payload: {
      account_id: owner.accountId,
      owner_user_id: owner.userId,
      description: 'Tracked access deal',
    },
  });

  masterFolderId = await addFolder('Lender package');
  await admin
    .from('lender_package')
    .insert({
      deal_id: dealId,
      account_id: owner.accountId,
      master_folder_id: masterFolderId,
    })
    .throwOnError();

  cim = await addDocument(masterFolderId, 'cim.pdf');
  pnl = await addDocument(masterFolderId, 'pnl.xlsx');
});

afterAll(async () => {
  await admin.storage.from(DATA_ROOM_BUCKET).remove(storedPaths);
  await Promise.all([
    owner.cleanup(),
    lender.cleanup(),
    outsider.cleanup(),
    signedOut.cleanup(),
  ]);
});

describe('recordActivity', () => {
  it('records a lender action as side lender under the lender id', async () => {
    const room = await newRoom();

    await recordActivity({
      client: lender.user,
      admin,
      roomId: room.id,
      action: 'room_opened',
    });

    expect(await activityIn(room.id)).toMatchObject([
      { user_id: lender.userId, side: 'lender', action: 'room_opened' },
    ]);
  });

  it('records a team action as side internal under the team member id', async () => {
    const room = await newRoom();

    await recordActivity({
      client: owner.user,
      admin,
      roomId: room.id,
      action: 'room_opened',
    });

    expect(await activityIn(room.id)).toMatchObject([
      { user_id: owner.userId, side: 'internal', action: 'room_opened' },
    ]);
  });

  it('refuses a non-member and records nothing', async () => {
    const room = await newRoom();

    await expect(
      recordActivity({
        client: outsider.user,
        admin,
        roomId: room.id,
        action: 'room_opened',
      }),
    ).rejects.toThrow('Caller has no access to this lender room');

    expect(await activityIn(room.id)).toEqual([]);
  });
});

describe('recordFolderActivity', () => {
  it('records a folder the room shows for a lender', async () => {
    const room = await newRoom();

    await recordFolderActivity({
      client: lender.user,
      admin,
      roomId: room.id,
      folderId: masterFolderId,
    });

    expect(await activityIn(room.id)).toMatchObject([
      {
        user_id: lender.userId,
        side: 'lender',
        action: 'folder_opened',
        dr_folder_id: masterFolderId,
        dr_document_id: null,
      },
    ]);
  });

  it('records a folder the room shows for the team', async () => {
    const room = await newRoom();

    await recordFolderActivity({
      client: owner.user,
      admin,
      roomId: room.id,
      folderId: room.privateFolderId,
    });

    expect(await activityIn(room.id)).toMatchObject([
      {
        user_id: owner.userId,
        side: 'internal',
        action: 'folder_opened',
        dr_folder_id: room.privateFolderId,
      },
    ]);
  });

  it('refuses a folder the room does not show and records nothing', async () => {
    const room = await newRoom();
    const otherRoom = await newRoom();
    const hiddenFolderId = await addFolder('Hidden', masterFolderId);

    await hide(room, { dr_folder_id: hiddenFolderId });

    for (const folderId of [otherRoom.privateFolderId, hiddenFolderId]) {
      await expect(
        recordFolderActivity({
          client: lender.user,
          admin,
          roomId: room.id,
          folderId,
        }),
      ).rejects.toThrow('Folder is not shown in this lender room');
    }

    expect(await activityIn(room.id)).toEqual([]);
  });
});

describe('respondToDocumentRequest', () => {
  it('redirects a preview to a URL that serves the file', async () => {
    const room = await newRoom();

    const response = await getDocument(room, cim.id);

    expect(response.status).toBe(307);
    expect(await (await fetchSignedFile(response)).text()).toBe(cim.body);
  });

  it('records a preview under the lender', async () => {
    const room = await newRoom();

    await getDocument(room, cim.id);

    expect(await activityIn(room.id)).toMatchObject([
      {
        user_id: lender.userId,
        side: 'lender',
        action: 'document_previewed',
        dr_document_id: cim.id,
      },
    ]);
  });

  it('records a download under the team member', async () => {
    const room = await newRoom();

    await getDocument(room, cim.id, {
      client: owner.user,
      query: '?disposition=download',
    });

    expect(await activityIn(room.id)).toMatchObject([
      {
        user_id: owner.userId,
        side: 'internal',
        action: 'document_downloaded',
        dr_document_id: cim.id,
      },
    ]);
  });

  it('names the download attachment after the document', async () => {
    const room = await newRoom();

    const file = await fetchSignedFile(
      await getDocument(room, cim.id, { query: '?disposition=download' }),
    );

    expect(file.headers.get('content-disposition')).toBe(
      "attachment; filename=cim.pdf; filename*=UTF-8''cim.pdf",
    );
  });

  it('serves a preview URL as an attachment so it never renders inline', async () => {
    const room = await newRoom();
    const page = await addDocument(room.privateFolderId, 'page.html');

    const file = await fetchSignedFile(await getDocument(room, page.id));

    expect(file.headers.get('content-disposition')).toMatch(/^attachment/);
  });

  it.each(['site.HEIC', 'site.heif'])(
    'previews %s through its JPEG rendition',
    async (name) => {
      const room = await newRoom();
      const photo = await addDocument(room.privateFolderId, name);

      await store(`${photo.storagePath}.preview.jpg`, 'converted jpeg');

      const file = await fetchSignedFile(await getDocument(room, photo.id));

      expect(await file.text()).toBe('converted jpeg');
    },
  );

  it('previews a PowerPoint document through its PDF rendition', async () => {
    const room = await newRoom();
    const deck = await addDocument(room.privateFolderId, 'deck.pptx');

    await store(`${deck.storagePath}.preview.pdf`, 'converted pdf');

    const file = await fetchSignedFile(await getDocument(room, deck.id));

    expect(await file.text()).toBe('converted pdf');
  });

  it('creates the rendition on preview when the file has none yet', async () => {
    const room = await newRoom();
    const photo = await addDocumentRow(room.privateFolderId, 'from-data-room.heic');

    await store(photo.storagePath, HEIC_SAMPLE);

    const file = await fetchSignedFile(await getDocument(room, photo.id));

    expect(file.headers.get('content-type')).toBe('image/jpeg');
  });

  it('downloads the original of a document that has a rendition', async () => {
    const room = await newRoom();
    const photo = await addDocument(room.privateFolderId, 'site.heic');

    await store(`${photo.storagePath}.preview.jpg`, 'converted jpeg');

    const file = await fetchSignedFile(
      await getDocument(room, photo.id, { query: '?disposition=download' }),
    );

    expect(await file.text()).toBe(photo.body);
  });

  it('records nothing when the file cannot be signed', async () => {
    const room = await newRoom();
    const missing = await addDocumentRow(room.privateFolderId, 'never-uploaded.pdf');

    await expect(
      getDocument(room, missing.id, { query: '?disposition=download' }),
    ).rejects.toThrow();

    expect(await activityIn(room.id)).toEqual([]);
  });

  it('answers 404 for a document in another room', async () => {
    const room = await newRoom();
    const otherRoom = await newRoom();

    await expectDocumentRefused(
      room,
      (await addDocument(otherRoom.privateFolderId, 'for-other.pdf')).id,
    );
  });

  it('answers 404 for a document hidden from the room', async () => {
    const room = await newRoom();
    const hidden = await addDocument(masterFolderId, `hidden-${room.id}.pdf`);

    await hide(room, { dr_document_id: hidden.id });

    await expectDocumentRefused(room, hidden.id);
  });

  it('answers 404 for another version of a hidden document', async () => {
    const room = await newRoom();
    const hidden = await addDocument(masterFolderId, `versioned-${room.id}.pdf`);
    const newerVersion = await addDocument(masterFolderId, hidden.name);

    await hide(room, { dr_document_id: hidden.id });

    await expectDocumentRefused(room, newerVersion.id);
  });

  it('answers 404 for a document under a hidden folder', async () => {
    const room = await newRoom();
    const hiddenFolderId = await addFolder('Hidden', masterFolderId);
    const nestedFolderId = await addFolder('Nested', hiddenFolderId);
    const nested = await addDocument(nestedFolderId, 'nested.pdf');

    await hide(room, { dr_folder_id: hiddenFolderId });

    await expectDocumentRefused(room, nested.id);
  });

  it('answers 404 for a removed document', async () => {
    const room = await newRoom();
    const removed = await addDocument(room.privateFolderId, 'removed.pdf');

    await removeDocument(removed);

    await expectDocumentRefused(room, removed.id);
  });

  it('answers 404 to a lender once the room is closed', async () => {
    await expectDocumentRefused(await closedRoom(), cim.id);
  });

  it('answers 404 to a lender once the room has expired', async () => {
    const room = await newRoom();

    await admin
      .from('lender_room')
      .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
      .eq('id', room.id)
      .throwOnError();

    await expectDocumentRefused(room, cim.id);
  });

  it('answers 404 to a person removed from the room', async () => {
    const room = await newRoom();

    await admin
      .from('lender_room_member')
      .delete()
      .eq('room_id', room.id)
      .throwOnError();

    await expectDocumentRefused(room, cim.id);
  });

  it.each([
    ['a missing disposition', ''],
    ['an unknown disposition', '?disposition=inline'],
  ])('answers 400 for %s and records nothing', async (_case, query) => {
    const room = await newRoom();

    expect((await getDocument(room, cim.id, { query })).status).toBe(400);
    expect(await activityIn(room.id)).toEqual([]);
  });

  it('answers 400 for a malformed document id', async () => {
    const room = await newRoom();

    expect((await getDocument(room, 'not-a-uuid')).status).toBe(400);
  });

  it('sends a signed-out caller to the lender sign-in with the room as next', async () => {
    const room = await newRoom();

    const response = await getDocument(room, cim.id, {
      client: signedOut.user,
    });

    expect([response.status, response.headers.get('location')]).toEqual([
      307,
      `${ORIGIN}/lender/sign-in?next=%2Flender%2F${room.id}`,
    ]);
  });

  it('sends a cross-site request back to the room page and records nothing', async () => {
    const room = await newRoom();

    const response = await getDocument(room, cim.id, {
      headers: { 'sec-fetch-site': 'cross-site' },
    });

    expect([response.status, response.headers.get('location')]).toEqual([
      307,
      `${ORIGIN}/lender/${room.id}`,
    ]);
    expect(await activityIn(room.id)).toEqual([]);
  });
});

describe('respondToPackageDocumentRequest', () => {
  let manager: IntegrationAccount;
  let stranger: IntegrationAccount;
  let teamSlug: string;
  let teamDealId: string;
  let packageFile: StoredDocument;
  let nestedPackageFile: StoredDocument;
  let outsidePackage: StoredDocument;

  async function addTeamFolder(name: string, parentId?: string) {
    const { data } = await manager.user
      .from('dr_folder')
      .insert({
        account_id: teamAccountId,
        deal_id: teamDealId,
        name,
        parent_id: parentId,
      })
      .select('id')
      .single()
      .throwOnError();

    return data.id;
  }

  async function addTeamDocument(folderId: string, name: string) {
    const id = crypto.randomUUID();
    const storagePath = `deal/${teamDealId}/${crypto.randomUUID()}`;
    const body = `bytes of ${name} ${id}`;

    await store(storagePath, body);
    await appendDealEvent(manager.user, {
      dealId: teamDealId,
      aggregateType: 'dr_document',
      aggregateId: id,
      eventType: 'dr_document.added',
      payload: { folder_id: folderId, name, storage_path: storagePath, version: 1 },
    });

    return { id, name, storagePath, body };
  }

  let teamAccountId: string;
  let packageFolderId: string;

  function getPackageDocument(
    documentId: string,
    {
      client = manager.user,
      slug = teamSlug,
      deal = teamDealId,
      query = '?disposition=preview',
      headers = {},
    }: {
      client?: Client;
      slug?: string;
      deal?: string;
      query?: string;
      headers?: Record<string, string>;
    } = {},
  ): Promise<Response> {
    requestClients.client = client;
    requestClients.admin = admin;

    return respondToPackageDocumentRequest({
      client,
      admin,
      request: new Request(
        `${ORIGIN}/home/${slug}/deals/${deal}/lenders/package/files/${documentId}${query}`,
        { headers },
      ),
      accountSlug: slug,
      dealId: deal,
      documentId,
    });
  }

  beforeAll(async () => {
    [manager, stranger] = await Promise.all([
      provisionAccount(),
      provisionAccount(),
    ]);
    teamSlug = `lender-team-${crypto.randomUUID().slice(0, 8)}`;

    const { data: team } = await admin
      .rpc('create_team_account', {
        account_name: 'Lender Team',
        user_id: manager.userId,
        account_slug: teamSlug,
      })
      .throwOnError();

    teamAccountId = team.id;
    teamDealId = crypto.randomUUID();

    await admin
      .from('accounts_memberships')
      .insert({
        account_id: teamAccountId,
        user_id: outsider.userId,
        account_role: 'member',
      })
      .throwOnError();
    await appendDealEvent(manager.user, {
      dealId: teamDealId,
      aggregateType: 'deal',
      aggregateId: teamDealId,
      eventType: 'deal.created',
      payload: {
        account_id: teamAccountId,
        owner_user_id: manager.userId,
        description: 'Team deal with a lender package',
      },
    });

    packageFolderId = await addTeamFolder('Lender package');
    const nestedFolderId = await addTeamFolder('Financials', packageFolderId);
    const diligenceFolderId = await addTeamFolder('Diligence');

    await manager.user
      .from('lender_package')
      .insert({
        deal_id: teamDealId,
        account_id: teamAccountId,
        master_folder_id: packageFolderId,
      })
      .throwOnError();

    const roomFolderId = await addTeamFolder('Room');
    const { data: room } = await manager.user
      .from('lender_room')
      .insert({
        account_id: teamAccountId,
        deal_id: teamDealId,
        name: 'Team lender',
        private_folder_id: roomFolderId,
      })
      .select('id')
      .single()
      .throwOnError();

    await admin
      .from('lender_room_member')
      .insert({
        room_id: room.id,
        user_id: lender.userId,
        email: lenderEmail,
        invited_by: manager.userId,
      })
      .throwOnError();

    packageFile = await addTeamDocument(packageFolderId, 'package.pdf');
    nestedPackageFile = await addTeamDocument(nestedFolderId, 'model.xlsx');
    outsidePackage = await addTeamDocument(diligenceFolderId, 'tax-return.pdf');
  });

  afterAll(async () => {
    await Promise.all([manager.cleanup(), stranger.cleanup()]);
  });

  it('redirects a manager preview to a URL that serves the file as an attachment', async () => {
    const file = await fetchSignedFile(await getPackageDocument(packageFile.id));

    expect([
      await file.text(),
      file.headers.get('content-disposition')?.startsWith('attachment'),
    ]).toEqual([packageFile.body, true]);
  });

  it('lets a manager download a file below the package folder by its name', async () => {
    const file = await fetchSignedFile(
      await getPackageDocument(nestedPackageFile.id, {
        query: '?disposition=download',
      }),
    );

    expect(file.headers.get('content-disposition')).toBe(
      "attachment; filename=model.xlsx; filename*=UTF-8''model.xlsx",
    );
  });

  it('previews a PowerPoint package file through its PDF rendition', async () => {
    const deck = await addTeamDocument(packageFolderId, 'deck.pptx');

    await store(`${deck.storagePath}.preview.pdf`, 'converted pdf');

    const file = await fetchSignedFile(await getPackageDocument(deck.id));

    expect(await file.text()).toBe('converted pdf');
  });

  it('answers 404 for a document outside the package', async () => {
    expect((await getPackageDocument(outsidePackage.id)).status).toBe(404);
  });

  it('answers 404 for a package document asked for under another deal', async () => {
    const response = await getPackageDocument(packageFile.id, { deal: dealId });

    expect(response.status).toBe(404);
  });

  it('answers 404 to a lender of the deal', async () => {
    expect(
      (await getPackageDocument(packageFile.id, { client: lender.user })).status,
    ).toBe(404);
  });

  it('answers 404 to a manager of another deal', async () => {
    expect(
      (await getPackageDocument(packageFile.id, { client: stranger.user }))
        .status,
    ).toBe(404);
  });

  it('answers 404 to a team member without deals.manage', async () => {
    expect(
      (await getPackageDocument(packageFile.id, { client: outsider.user }))
        .status,
    ).toBe(404);
  });

  it('answers 404 when the account in the URL is not the deal account', async () => {
    expect(
      (await getPackageDocument(packageFile.id, { slug: 'some-other-team' }))
        .status,
    ).toBe(404);
  });

  it('refuses a cross-site request', async () => {
    const response = await getPackageDocument(packageFile.id, {
      headers: { 'sec-fetch-site': 'cross-site' },
    });

    expect(response.status).toBe(403);
  });

  it('answers 400 for an unknown disposition', async () => {
    expect(
      (await getPackageDocument(packageFile.id, { query: '?disposition=inline' }))
        .status,
    ).toBe(400);
  });

  it('sends a signed-out caller to sign in', async () => {
    const response = await getPackageDocument(packageFile.id, {
      client: signedOut.user,
    });

    expect([response.status, response.headers.get('location')]).toEqual([
      307,
      `${ORIGIN}/auth/sign-in`,
    ]);
  });
});

describe('respondToZipRequest', () => {
  it('streams the requested files under their room root folder', async () => {
    const room = await newRoom();

    const response = await postZip(room, [cim.id, pnl.id]);

    expect(response.status).toBe(200);
    expect(await unzipped(response)).toEqual({
      'Lender package/cim.pdf': cim.body,
      'Lender package/pnl.xlsx': pnl.body,
    });
  });

  it('names the zip after the room', async () => {
    const room = await newRoom();

    const response = await postZip(room, [cim.id]);

    expect([
      response.headers.get('content-type'),
      response.headers.get('content-disposition'),
    ]).toEqual([
      'application/zip',
      "attachment; filename*=UTF-8''First%20Bank%20%26%20Trust.zip",
    ]);
  });

  it('records one zip row listing the ids and no per-document rows', async () => {
    const room = await newRoom();

    await postZip(room, [cim.id, pnl.id]);

    expect(await activityIn(room.id)).toMatchObject([
      {
        user_id: lender.userId,
        side: 'lender',
        action: 'zip_downloaded',
        dr_document_id: null,
        payload: { document_ids: [cim.id, pnl.id] },
      },
    ]);
  });

  it('records a team member zip as internal', async () => {
    const room = await newRoom();

    await postZip(room, [cim.id], { client: owner.user });

    expect(await activityIn(room.id)).toMatchObject([
      { user_id: owner.userId, side: 'internal', action: 'zip_downloaded' },
    ]);
  });

  it('lets the team zip from a closed room', async () => {
    const room = await closedRoom();

    const response = await postZip(room, [cim.id], { client: owner.user });

    expect(await unzipped(response)).toEqual({
      'Lender package/cim.pdf': cim.body,
    });
  });

  it('keeps the folder path below the private folder', async () => {
    const room = await newRoom();
    const notesFolderId = await addFolder('Notes', room.privateFolderId);
    const memo = await addDocument(notesFolderId, 'memo.txt');

    expect(await unzipped(await postZip(room, [memo.id]))).toEqual({
      [`${room.privateFolderName}/Notes/memo.txt`]: memo.body,
    });
  });

  it('numbers entries that share a path', async () => {
    const room = await newRoom();
    const first = await addDocument(room.privateFolderId, 'terms.pdf');
    const second = await addDocument(room.privateFolderId, 'terms.pdf');
    const third = await addDocument(room.privateFolderId, 'terms.pdf');

    expect(
      await unzipped(await postZip(room, [first.id, second.id, third.id])),
    ).toEqual({
      [`${room.privateFolderName}/terms.pdf`]: first.body,
      [`${room.privateFolderName}/terms (2).pdf`]: second.body,
      [`${room.privateFolderName}/terms (3).pdf`]: third.body,
    });
  });

  it('collapses repeated ids', async () => {
    const room = await newRoom();

    const response = await postZip(room, [cim.id, pnl.id, cim.id]);

    expect(Object.keys(await unzipped(response))).toEqual([
      'Lender package/cim.pdf',
      'Lender package/pnl.xlsx',
    ]);
    expect((await activityIn(room.id)).map((row) => row.payload)).toEqual([
      { document_ids: [cim.id, pnl.id] },
    ]);
  });

  it('keeps entries inside the room root folder whatever the names say', async () => {
    const room = await newRoom();
    const slashFolderId = await addFolder('a/b', room.privateFolderId);
    const dotsFolderId = await addFolder('..', slashFolderId);
    const escaping = await addDocument(dotsFolderId, '../..\\x.plist');

    expect(await unzipped(await postZip(room, [escaping.id]))).toEqual({
      [`${room.privateFolderName}/a_b/.._.._x.plist`]: escaping.body,
    });
  });

  it('answers 404 and records nothing when one id is in another room', async () => {
    const room = await newRoom();
    const otherRoom = await newRoom();
    const inOtherRoom = await addDocument(otherRoom.privateFolderId, 'for-other.pdf');

    await expectZipRefused(room, [cim.id, inOtherRoom.id]);
  });

  it('answers 404 and records nothing when one id is hidden', async () => {
    const room = await newRoom();
    const hidden = await addDocument(masterFolderId, `hidden-${room.id}.pdf`);

    await hide(room, { dr_document_id: hidden.id });

    await expectZipRefused(room, [cim.id, hidden.id]);
  });

  it('answers 404 and records nothing when one id is removed', async () => {
    const room = await newRoom();
    const removed = await addDocument(room.privateFolderId, 'removed.pdf');

    await removeDocument(removed);

    await expectZipRefused(room, [cim.id, removed.id]);
  });

  it('answers 404 to a lender once the room is closed', async () => {
    await expectZipRefused(await closedRoom(), [cim.id]);
  });

  it('answers 404 and records nothing when one file is missing from storage', async () => {
    const room = await newRoom();
    const missing = await addDocumentRow(room.privateFolderId, 'never-uploaded.pdf');

    await expectZipRefused(room, [cim.id, missing.id]);
  });

  it('answers 400 for an empty list and records nothing', async () => {
    const room = await newRoom();

    expect((await postZip(room, [])).status).toBe(400);
    expect(await activityIn(room.id)).toEqual([]);
  });

  it('answers 400 for a malformed id', async () => {
    const room = await newRoom();

    expect((await postZip(room, [cim.id, 'not-a-uuid'])).status).toBe(400);
  });

  it('answers 400 for a body that is not a form', async () => {
    const room = await newRoom();

    const response = await postZip(room, [], {
      headers: { origin: ORIGIN, host: HOST, 'content-type': 'application/json' },
      body: JSON.stringify({ documentIds: [cim.id] }),
    });

    expect(response.status).toBe(400);
  });

  it('answers 401 to a signed-out caller', async () => {
    const room = await newRoom();

    expect(
      (await postZip(room, [cim.id], { client: signedOut.user })).status,
    ).toBe(401);
  });

  it.each([
    ['no Origin', { host: HOST }],
    ['an Origin on another host', { origin: 'https://evil.test', host: HOST }],
    ['an opaque Origin', { origin: 'null', host: HOST }],
  ])('answers 403 to a request with %s and records nothing', async (_case, headers) => {
    const room = await newRoom();

    expect((await postZip(room, [cim.id], { headers })).status).toBe(403);
    expect(await activityIn(room.id)).toEqual([]);
  });

  it('accepts an https Origin on its own host when the proxy forwards plain http', async () => {
    const room = await newRoom();

    const response = await postZip(room, [cim.id], {
      headers: { origin: `https://${HOST}`, host: HOST },
    });

    expect(response.status).toBe(200);
  });

  it('compares the Origin with the forwarded host when there is one', async () => {
    const room = await newRoom();

    const response = await postZip(room, [cim.id], {
      headers: {
        origin: 'https://rooms.example',
        host: 'web.internal:3000',
        'x-forwarded-host': 'rooms.example',
      },
    });

    expect(response.status).toBe(200);
  });

  it('answers 400 for a malformed room id', async () => {
    const room = await newRoom();

    const response = await postZip({ ...room, id: 'not-a-uuid' }, [cim.id]);

    expect(response.status).toBe(400);
  });
});

describe('signedInUser', () => {
  it('treats a session the auth server rejects as signed out', async () => {
    expect(await signedInUser(deleted.user)).toBeNull();
  });

  it('throws when the auth server answers with a server error', async () => {
    const client = await clientWhoseAuthServer(
      lender,
      async () => new Response('{}', { status: 500 }),
    );

    await expect(signedInUser(client)).rejects.toThrow();
  });

  it('throws when the auth server cannot be reached', async () => {
    const client = await clientWhoseAuthServer(lender, async () => {
      throw new TypeError('fetch failed');
    });

    await expect(signedInUser(client)).rejects.toThrow();
  });
});

describe('fetchRoomActivity', () => {
  it('lists the room activity newest first with person, side, action, and target', async () => {
    const room = await newRoom();

    await recordActivity({
      client: lender.user,
      admin,
      roomId: room.id,
      action: 'room_opened',
    });
    await getDocument(room, cim.id);
    await recordFolderActivity({
      client: owner.user,
      admin,
      roomId: room.id,
      folderId: masterFolderId,
    });

    expect(await fetchRoomActivity(owner.user, room.id)).toMatchObject([
      {
        userId: owner.userId,
        email: ownerEmail,
        side: 'internal',
        action: 'folder_opened',
        folderId: masterFolderId,
        folderName: 'Lender package',
        documentId: null,
        documentName: null,
      },
      {
        userId: lender.userId,
        email: lenderEmail,
        side: 'lender',
        action: 'document_previewed',
        documentId: cim.id,
        documentName: 'cim.pdf',
        folderId: null,
        folderName: null,
      },
      {
        userId: lender.userId,
        email: lenderEmail,
        side: 'lender',
        action: 'room_opened',
        documentId: null,
        documentName: null,
        folderId: null,
        folderName: null,
      },
    ]);
  });

  it('keeps an entry with a null name once its document is removed', async () => {
    const room = await newRoom();
    const shortLived = await addDocument(room.privateFolderId, 'short-lived.pdf');

    await getDocument(room, shortLived.id);
    await removeDocument(shortLived);

    expect(await fetchRoomActivity(owner.user, room.id)).toMatchObject([
      { documentId: shortLived.id, documentName: null },
    ]);
  });

  it('shows a lender nothing', async () => {
    const room = await newRoom();

    await getDocument(room, cim.id);

    expect(await fetchRoomActivity(lender.user, room.id)).toEqual([]);
  });
});

describe('fetchRoomActivity beyond recorded activity', () => {
  it('merges requests, replies, forms, and uploads with recorded activity in time order', async () => {
    const room = await newRoom();

    await recordActivity({
      client: lender.user,
      admin,
      roomId: room.id,
      action: 'room_opened',
    });
    const askId = await openRequest(room, 'ask', 'Tax returns?');
    await replyAsTeam(askId);
    await replyAsLender(askId);
    const formId = await openRequest(room, 'form', 'Loan application');
    const fromLender = await uploadAsLender(room.privateFolderId, 'appraisal.pdf');
    const fromTeam = await addDocumentRow(room.privateFolderId, 'term-sheet-notes.pdf');
    await getDocument(room, cim.id);

    const entries = await fetchRoomActivity(owner.user, room.id);

    expect(
      entries.map((entry) => [entry.kind, entry.side, entry.userId, entry.id]),
    ).toEqual([
      ['recorded', 'lender', lender.userId, expect.any(String)],
      ['file_uploaded', 'internal', owner.userId, fromTeam.id],
      ['file_uploaded', 'lender', lender.userId, fromLender.id],
      ['form_uploaded', 'lender', lender.userId, formId],
      ['reply', 'lender', lender.userId, expect.any(String)],
      ['reply', 'internal', owner.userId, expect.any(String)],
      ['request_opened', 'lender', lender.userId, askId],
      ['recorded', 'lender', lender.userId, expect.any(String)],
    ]);
  });

  it('gives a request entry what a line and a link to its thread need', async () => {
    const room = await newRoom();
    const askId = await openRequest(room, 'ask', 'Tax returns?');

    expect(await composedEntries(room)).toEqual([
      {
        kind: 'request_opened',
        id: askId,
        at: expect.any(String),
        userId: lender.userId,
        email: lenderEmail,
        name: null,
        isRemoved: false,
        side: 'lender',
        askId,
        askKind: 'ask',
        askTitle: 'Tax returns?',
      },
    ]);
  });

  it('gives a reply entry the request it belongs to', async () => {
    const room = await newRoom();
    const formId = await openRequest(room, 'form', 'Loan application');

    await replyAsTeam(formId);

    expect((await composedEntries(room))[0]).toMatchObject({
      kind: 'reply',
      email: ownerEmail,
      side: 'internal',
      askId: formId,
      askKind: 'form',
      askTitle: 'Loan application',
    });
  });

  it('gives an upload entry the file and the folder it went into', async () => {
    const room = await newRoom();
    const notesFolderId = await addFolder('Notes', room.privateFolderId);
    const upload = await uploadAsLender(notesFolderId, 'appraisal.pdf');

    expect(await composedEntries(room)).toEqual([
      {
        kind: 'file_uploaded',
        id: upload.id,
        at: expect.any(String),
        userId: lender.userId,
        email: lenderEmail,
        name: null,
        isRemoved: false,
        side: 'lender',
        documentId: upload.id,
        documentName: 'appraisal.pdf',
        folderId: notesFolderId,
        folderName: 'Notes',
      },
    ]);
  });

  it('counts a request opening once and not as a reply', async () => {
    const room = await newRoom();

    await openRequest(room, 'ask', 'Tax returns?');

    expect((await composedEntries(room)).map((entry) => entry.kind)).toEqual([
      'request_opened',
    ]);
  });

  it('does not list a file attached to a thread as an upload', async () => {
    const room = await newRoom();
    const askId = await openRequest(room, 'ask', 'Tax returns?');

    await attach(
      askId,
      await uploadAsLender(room.privateFolderId, 'supporting.pdf'),
      'attachment',
    );

    expect((await composedEntries(room)).map((entry) => entry.kind)).toEqual([
      'thread_file',
      'request_opened',
    ]);
  });

  it('gives a thread file entry its request, its file, and its role', async () => {
    const room = await newRoom();
    const askId = await openRequest(room, 'ask', 'Tax returns?');
    const supporting = await uploadAsLender(room.privateFolderId, 'supporting.pdf');
    const fileId = await attach(askId, supporting, 'attachment');

    expect((await composedEntries(room))[0]).toEqual({
      kind: 'thread_file',
      id: fileId,
      at: expect.any(String),
      userId: lender.userId,
      email: lenderEmail,
      name: null,
      isRemoved: false,
      side: 'lender',
      askId,
      askKind: 'ask',
      askTitle: 'Tax returns?',
      documentId: supporting.id,
      documentName: 'supporting.pdf',
      role: 'attachment',
    });
  });

  it('labels a file our team adds to a thread as internal', async () => {
    const room = await newRoom();
    const askId = await openRequest(room, 'ask', 'Tax returns?');

    await attach(
      askId,
      await addDocumentRow(room.privateFolderId, 'returns-2025.pdf'),
      'fulfilment',
      owner.userId,
    );

    expect((await composedEntries(room))[0]).toMatchObject({
      kind: 'thread_file',
      role: 'fulfilment',
      userId: owner.userId,
      email: ownerEmail,
      side: 'internal',
    });
  });

  it('lists a file beside the reply it came with, each once', async () => {
    const room = await newRoom();
    const askId = await openRequest(room, 'ask', 'Tax returns?');

    await replyAsLender(askId);
    await attach(
      askId,
      await uploadAsLender(room.privateFolderId, 'supporting.pdf'),
      'attachment',
    );

    expect((await composedEntries(room)).map((entry) => entry.kind)).toEqual([
      'thread_file',
      'reply',
      'request_opened',
    ]);
  });

  it('treats the blank form a form request starts with as part of the form entry', async () => {
    const room = await newRoom();

    await openFormWithBlank(room);

    expect((await composedEntries(room)).map((entry) => entry.kind)).toEqual([
      'form_uploaded',
    ]);
  });

  it('lists a replaced blank form as a thread file', async () => {
    const room = await newRoom();
    const formId = await openFormWithBlank(room);
    const replacement = await uploadAsLender(room.privateFolderId, 'blank-v2.pdf');

    await attach(formId, replacement, 'blank_form');

    expect(
      (await composedEntries(room)).map((entry) => [
        entry.kind,
        'role' in entry && entry.role,
        'documentId' in entry && entry.documentId,
      ]),
    ).toEqual([
      ['thread_file', 'blank_form', replacement.id],
      ['form_uploaded', false, false],
    ]);
  });

  it('lists a signed form filed by the system with no person and side internal', async () => {
    const room = await newRoom();
    const formId = await openFormWithBlank(room);

    await attach(
      formId,
      await uploadAsLender(room.privateFolderId, 'signed.pdf'),
      'signed_form',
      null,
    );

    expect((await composedEntries(room))[0]).toMatchObject({
      kind: 'thread_file',
      role: 'signed_form',
      userId: null,
      email: null,
      name: null,
      isRemoved: false,
      side: 'internal',
    });
  });

  it('leaves out files added to the master package', async () => {
    const room = await newRoom();

    await addDocumentRow(masterFolderId, `package-${room.id}.pdf`);

    expect(await composedEntries(room)).toEqual([]);
  });

  it('leaves out another room requests, replies, and uploads', async () => {
    const room = await newRoom();
    const otherRoom = await newRoom();

    await replyAsLender(await openRequest(otherRoom, 'ask', 'For the other room'));
    await uploadAsLender(otherRoom.privateFolderId, 'other-room.pdf');

    expect(await fetchRoomActivity(owner.user, room.id)).toEqual([]);
  });

  it('shows a lender nothing even though they can read their own requests', async () => {
    const room = await newRoom();

    await replyAsLender(await openRequest(room, 'ask', 'Tax returns?'));
    await uploadAsLender(room.privateFolderId, 'appraisal.pdf');

    expect(await fetchRoomActivity(lender.user, room.id)).toEqual([]);
  });

  it('leaves out an upload whose document has no uploader', async () => {
    const room = await newRoom();

    await appendDealEvent(admin, {
      dealId,
      aggregateType: 'dr_document',
      aggregateId: crypto.randomUUID(),
      eventType: 'dr_document.added',
      actorKind: 'service',
      payload: {
        folder_id: room.privateFolderId,
        name: 'from-nobody.pdf',
        storage_path: `deal/${dealId}/${crypto.randomUUID()}`,
        version: 1,
      },
    });

    expect(await composedEntries(room)).toEqual([]);
  });

  it('marks a removed person who only opened a request and keeps their email', async () => {
    const room = await newRoom();

    await addMember(room, outsider);
    await openRequest(room, 'ask', 'Tax returns?', outsider);
    await removeMember(room, outsider);

    expect(await composedEntries(room)).toMatchObject([
      {
        kind: 'request_opened',
        userId: outsider.userId,
        email: await emailOf(outsider),
        isRemoved: true,
      },
    ]);
  });

  it('marks a removed person who only uploaded a file and keeps their email', async () => {
    const room = await newRoom();

    await addMember(room, outsider);
    await uploadAsLender(room.privateFolderId, 'appraisal.pdf', outsider);
    await removeMember(room, outsider);

    expect(await composedEntries(room)).toMatchObject([
      {
        kind: 'file_uploaded',
        userId: outsider.userId,
        email: await emailOf(outsider),
        isRemoved: true,
      },
    ]);
  });

  it('does not mark a person who was removed and invited again', async () => {
    const room = await newRoom();

    await addMember(room, outsider);
    await openRequest(room, 'ask', 'Tax returns?', outsider);
    await removeMember(room, outsider);
    await addMember(room, outsider);

    expect(await composedEntries(room)).toMatchObject([
      { userId: outsider.userId, isRemoved: false },
    ]);
  });

  it('carries the name of a named person', async () => {
    const room = await newRoom();

    await nameOutsider();
    await addMember(room, outsider);
    await openRequest(room, 'ask', 'Tax returns?', outsider);

    expect(await composedEntries(room)).toMatchObject([
      { userId: outsider.userId, name: 'Dana Reyes' },
    ]);
  });

  it('keeps the name of a person since removed', async () => {
    const room = await newRoom();

    await nameOutsider();
    await addMember(room, outsider);
    await uploadAsLender(room.privateFolderId, 'appraisal.pdf', outsider);
    await removeMember(room, outsider);

    expect(await composedEntries(room)).toMatchObject([
      { userId: outsider.userId, name: 'Dana Reyes', isRemoved: true },
    ]);
  });

  it('gives a person with no name a null name', async () => {
    const room = await newRoom();

    await getDocument(room, cim.id);

    expect(await fetchRoomActivity(owner.user, room.id)).toMatchObject([
      { userId: lender.userId, name: null },
    ]);
  });

  it('marks recorded activity of a removed person', async () => {
    const room = await newRoom();

    await getDocument(room, cim.id);
    await removeMember(room, lender);

    expect(await fetchRoomActivity(owner.user, room.id)).toMatchObject([
      { kind: 'recorded', userId: lender.userId, isRemoved: true },
    ]);
  });
});

describe('fetchSeenBy', () => {
  it('carries the name of a named person', async () => {
    const room = await newRoom();

    await nameOutsider();
    await addMember(room, outsider);
    await getDocument(room, cim.id, { client: outsider.user });

    expect(await fetchSeenBy(owner.user, room.id)).toMatchObject([
      { userId: outsider.userId, name: 'Dana Reyes' },
    ]);
  });

  it('marks a person since removed from the room', async () => {
    const room = await newRoom();

    await getDocument(room, cim.id);
    await removeMember(room, lender);

    expect(await fetchSeenBy(owner.user, room.id)).toMatchObject([
      { userId: lender.userId, email: lenderEmail, isRemoved: true },
    ]);
  });

  it('gives each person their first preview and first download of a document', async () => {
    const room = await newRoom();
    const download = { query: '?disposition=download' };

    await getDocument(room, cim.id);
    await getDocument(room, cim.id);
    await getDocument(room, cim.id, download);
    await getDocument(room, cim.id, download);
    await getDocument(room, cim.id, { client: owner.user, ...download });

    const rows = await activityIn(room.id);
    const seen = await fetchSeenBy(owner.user, room.id);

    expect(seen).toHaveLength(2);
    expect(seen).toEqual(
      expect.arrayContaining([
        {
          documentId: cim.id,
          documentName: 'cim.pdf',
          userId: lender.userId,
          email: lenderEmail,
          name: null,
          isRemoved: false,
          side: 'lender',
          firstPreviewedAt: rows[0]!.created_at,
          firstDownloadedAt: rows[2]!.created_at,
        },
        {
          documentId: cim.id,
          documentName: 'cim.pdf',
          userId: owner.userId,
          email: ownerEmail,
          name: null,
          isRemoved: false,
          side: 'internal',
          firstPreviewedAt: null,
          firstDownloadedAt: rows[4]!.created_at,
        },
      ]),
    );
  });

  it('ignores zip downloads', async () => {
    const room = await newRoom();

    await postZip(room, [cim.id, pnl.id]);

    expect(await activityIn(room.id)).toHaveLength(1);
    expect(await fetchSeenBy(owner.user, room.id)).toEqual([]);
  });

  it('keeps an entry with a null name once its document is removed', async () => {
    const room = await newRoom();
    const shortLived = await addDocument(room.privateFolderId, 'short-lived.pdf');

    await getDocument(room, shortLived.id);
    await removeDocument(shortLived);

    expect(await fetchSeenBy(owner.user, room.id)).toMatchObject([
      { documentId: shortLived.id, documentName: null },
    ]);
  });

  it('shows a lender nothing', async () => {
    const room = await newRoom();

    await getDocument(room, cim.id);

    expect(await fetchSeenBy(lender.user, room.id)).toEqual([]);
  });
});
