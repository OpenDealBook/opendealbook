import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { strToU8, zipSync } from 'fflate';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { appendDealEvent } from '@odb/events';
import type { Database } from '@odb/supabase';

import { unwrap } from '../actions/test-support/unwrap';
import { MAX_UPLOAD_BYTES } from './allowed';

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

type Client = SupabaseClient<Database>;

const session = vi.hoisted(() => ({
  user: null as unknown,
  admin: null as unknown,
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => session.user,
}));

vi.mock('@odb/supabase/admin', () => ({
  getSupabaseServerAdminClient: () => session.admin,
}));

import { beginUpload, cancelUpload, registerUpload } from './actions';
import { createFolder, createFolderTree } from './folder-actions';
import { removePackageFile } from './package-actions';

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';

const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const BUCKET = 'data-room';

const NO_ACCESS = 'You do not have access to this room';
const WRONG_FOLDER = "Files can only be added to the room's own folder";

const HEIC_SAMPLE = Uint8Array.from(
  Buffer.from(
    'AAAAJGZ0eXBoZWljAAAAAG1pZjFNaVBybWlhZk1pSEJoZWljAAABhm1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAHBpY3QAAAAAAAAAAAAAAAAAAAAAJGRpbmYAAAAcZHJlZgAAAAAAAAABAAAADHVybCAAAAABAAAADnBpdG0AAAAAAAEAAAAjaWluZgAAAAAAAQAAABVpbmZlAgAAAAABAABodmMxAAAAAOZpcHJwAAAAxWlwY28AAAATY29scm5jbHgAAgACAAaAAAAADGNsbGkAywBAAAAAFGlzcGUAAAAAAAAAEAAAABAAAAAJaXJvdAAAAAAQcGl4aQAAAAADCAgIAAAAcWh2Y0MBA3AAAACwAAAAAAAe8AD8/fj4AAALA6AAAQAXQAEMAf//A3AAAAMAsAAAAwAAAwAecCShAAEAI0IBAQNwAAADALAAAAMAAAMAHqAUIEHAkwziHuRZVNwICBgCogABAAlEAcBhcshAUyQAAAAZaXBtYQAAAAAAAAABAAEGgQIDBYaEAAAAHmlsb2MAAAAARAAAAQABAAAAAQAAAboAAAA8AAAAAW1kYXQAAAAAAAAATAAAADgoAa+jVyq0//uP//pu7LpGtUf/1Wp//ezf/2vFV3/6XT79Wvf7YA7O/7/vppoS01HCM8ULq1Lu4A==',
    'base64',
  ),
);

const ENCRYPTED_ZIP = Uint8Array.from(
  Buffer.from(
    'UEsDBAoACQAAAJ09TV2GphA2EQAAAAUAAAAJABwAc21hbGwudHh0VVQJAAO6Gc5quhnOanV4CwABBPUBAAAEAAAAAAfRQQAI/0S7nvyLXOMMnbupUEsHCIamEDYRAAAABQAAAFBLAQIeAwoACQAAAJ09TV2GphA2EQAAAAUAAAAJABgAAAAAAAAAAACkgQAAAABzbWFsbC50eHRVVAUAA7oZzmp1eAsAAQT1AQAABAAAAABQSwUGAAAAAAEAAQBPAAAAZAAAAAAA',
    'base64',
  ),
);

interface Person {
  client: Client;
  userId: string;
  accountId: string;
}

interface Room {
  id: string;
  folderId: string;
}

const admin: Client = createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const bucket = admin.storage.from(BUCKET);

const converter = {
  server: null as unknown as Server,
  working: true,
};

async function provisionPerson(): Promise<Person> {
  const unique = crypto.randomUUID().slice(0, 8);
  const email = `int-${unique}@odb.test`;
  const password = `Pw-${unique}-Aa1!`;

  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (created.error) {
    throw created.error;
  }

  const account = await admin
    .from('accounts')
    .select('id')
    .eq('primary_owner_user_id', created.data.user.id)
    .eq('is_personal_account', true)
    .single()
    .throwOnError();

  const client = createClient<Database>(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const signedIn = await client.auth.signInWithPassword({ email, password });

  if (signedIn.error) {
    throw signedIn.error;
  }

  return { client, userId: created.data.user.id, accountId: account.data.id };
}

async function newFolder(name: string, parentId?: string): Promise<string> {
  const folder = await admin
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

  return folder.data.id;
}

async function newRoom(
  name: string,
  ending: { closed_at?: string; expires_at?: string } = {},
): Promise<Room> {
  const folderId = await newFolder(name);

  const room = await admin
    .from('lender_room')
    .insert({
      account_id: owner.accountId,
      deal_id: dealId,
      name,
      private_folder_id: folderId,
      ...ending,
    })
    .select('id')
    .single()
    .throwOnError();

  return { id: room.data.id, folderId };
}

async function addMember(room: Room, person: Person) {
  await admin
    .from('lender_room_member')
    .insert({
      room_id: room.id,
      user_id: person.userId,
      email: `${person.userId}@odb.test`,
    })
    .throwOnError();
}

function begin(
  person: Person,
  room: Room,
  name: string,
  size: number,
  folderId = room.folderId,
) {
  session.user = person.client;

  return unwrap(beginUpload({ roomId: room.id, folderId, name, size }));
}

async function sendFile(
  person: Person,
  room: Room,
  name: string,
  bytes: Uint8Array,
  folderId = room.folderId,
) {
  const upload = await begin(person, room, name, bytes.length, folderId);
  const stored = await person.client.storage
    .from(BUCKET)
    .uploadToSignedUrl(upload.path, upload.token, bytes);

  if (stored.error) {
    throw stored.error;
  }

  return upload;
}

function register(
  person: Person,
  uploadId: string,
  keepAsZip = false,
): Promise<string[]> {
  session.user = person.client;

  return unwrap(registerUpload({ uploadId, keepAsZip }));
}

function cancel(person: Person, uploadId: string): Promise<void> {
  session.user = person.client;

  return unwrap(cancelUpload({ uploadId }));
}

async function uploadRows(uploadId: string) {
  const rows = await admin
    .from('lender_upload')
    .select('id')
    .eq('id', uploadId)
    .throwOnError();

  return rows.data;
}

async function upload(
  person: Person,
  room: Room,
  name: string,
  bytes: Uint8Array,
  folderId = room.folderId,
) {
  const sent = await sendFile(person, room, name, bytes, folderId);

  return { ...sent, ids: await register(person, sent.uploadId) };
}

async function documentsIn(folderId: string) {
  const documents = await admin
    .from('dr_document')
    .select('id, name, version, storage_path, folder_id')
    .eq('folder_id', folderId)
    .order('version')
    .throwOnError();

  return documents.data;
}

async function documentsNamed(folderId: string, name: string) {
  return (await documentsIn(folderId)).filter((doc) => doc.name === name);
}

async function foldersNamed(parentId: string, name: string) {
  const folders = await admin
    .from('dr_folder')
    .select('id')
    .eq('parent_id', parentId)
    .eq('name', name)
    .throwOnError();

  return folders.data.map((folder) => folder.id);
}

async function childFolder(parentId: string, name: string): Promise<string> {
  const ids = await foldersNamed(parentId, name);

  expect(ids).toHaveLength(1);

  return ids[0]!;
}

async function storedObject(path: string): Promise<Blob> {
  const object = await bucket.download(path);

  if (object.error) {
    throw object.error;
  }

  return object.data;
}

async function isStored(path: string): Promise<boolean> {
  return (await bucket.exists(path)).data;
}

let owner: Person;
let lender: Person;
let stranger: Person;
let dealId: string;
let masterFolderId: string;
let roomA: Room;
let roomB: Room;

beforeAll(async () => {
  converter.server = createServer((request, response) => {
    const chunks: Buffer[] = [];

    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const deck =
        /filename="[^"]+\.pptx"[\s\S]*?\r\n\r\n([\s\S]*?)\r\n--/.exec(
          Buffer.concat(chunks).toString('latin1'),
        );
      const converts =
        converter.working &&
        request.method === 'POST' &&
        request.url === '/forms/libreoffice/convert' &&
        deck;

      response.writeHead(converts ? 200 : 500);
      response.end(converts ? `%PDF-1.7 of ${deck[1]}` : 'libreoffice down');
    });
  });
  await new Promise<void>((resolve) => converter.server.listen(0, resolve));
  process.env.GOTENBERG_URL = `http://127.0.0.1:${(converter.server.address() as AddressInfo).port}`;

  session.admin = admin;
  [owner, lender, stranger] = await Promise.all([
    provisionPerson(),
    provisionPerson(),
    provisionPerson(),
  ]);

  dealId = crypto.randomUUID();
  await appendDealEvent(owner.client, {
    dealId,
    aggregateType: 'deal',
    aggregateId: dealId,
    eventType: 'deal.created',
    payload: {
      account_id: owner.accountId,
      owner_user_id: owner.userId,
      firm_id: null,
      description: 'Lender uploads deal',
      source: 'manual',
      stage: 'sourcing',
    },
  });

  masterFolderId = await newFolder('Lender package');
  await admin
    .from('lender_package')
    .insert({
      deal_id: dealId,
      account_id: owner.accountId,
      master_folder_id: masterFolderId,
    })
    .throwOnError();

  roomA = await newRoom('First Bank');
  roomB = await newRoom('Second Bank');
  await addMember(roomA, lender);
}, 60_000);

afterAll(async () => {
  converter.server.close();
  await admin
    .from('lender_upload')
    .delete()
    .in('uploaded_by', [owner.userId, lender.userId])
    .throwOnError();
  await Promise.all(
    [owner, lender, stranger].map((person) =>
      admin.auth.admin.deleteUser(person.userId),
    ),
  );
});

describe('who may upload', { timeout: 60_000 }, () => {
  it('registers a file a lender sent straight to storage, readable by that lender', async () => {
    const sent = await upload(lender, roomA, 'bank-form.pdf', strToU8('form'));

    const visible = await lender.client
      .from('dr_document')
      .select('id, name, folder_id, storage_path, version')
      .in('id', sent.ids)
      .throwOnError();

    expect(visible.data).toEqual([
      {
        id: sent.ids[0],
        name: 'bank-form.pdf',
        folder_id: roomA.folderId,
        storage_path: sent.path,
        version: 1,
      },
    ]);
  });

  it('lets the deal team upload into a lender room', async () => {
    await upload(owner, roomA, 'answer.pdf', strToU8('answer'));

    expect(await documentsNamed(roomA.folderId, 'answer.pdf')).toHaveLength(1);
  });

  it('refuses a lender beginning an upload in a room they are not in', async () => {
    await expect(begin(lender, roomB, 'x.pdf', 1)).rejects.toThrow(NO_ACCESS);
  });

  it('refuses an upload into the master package', async () => {
    await expect(
      begin(lender, roomA, 'x.pdf', 1, masterFolderId),
    ).rejects.toThrow(WRONG_FOLDER);
  });

  it("refuses an upload into another room's folder", async () => {
    await expect(
      begin(lender, roomA, 'x.pdf', 1, roomB.folderId),
    ).rejects.toThrow(WRONG_FOLDER);
  });

  it('refuses someone who is neither a member nor on the deal team', async () => {
    await expect(begin(stranger, roomA, 'x.pdf', 1)).rejects.toThrow(NO_ACCESS);
  });

  it('refuses to register an upload someone else began', async () => {
    const sent = await sendFile(lender, roomA, 'mine.pdf', strToU8('mine'));

    await expect(register(owner, sent.uploadId)).rejects.toThrow(
      'That upload was not found',
    );
    expect(await documentsNamed(roomA.folderId, 'mine.pdf')).toEqual([]);
  });

  it('refuses a lender in a closed room', async () => {
    const closed = await newRoom('Closed Bank', {
      closed_at: new Date().toISOString(),
    });
    await addMember(closed, lender);

    await expect(begin(lender, closed, 'x.pdf', 1)).rejects.toThrow(NO_ACCESS);
  });

  it('refuses a lender in an expired room', async () => {
    const expired = await newRoom('Expired Bank', {
      expires_at: new Date(Date.now() - 60_000).toISOString(),
    });
    await addMember(expired, lender);

    await expect(begin(lender, expired, 'x.pdf', 1)).rejects.toThrow(NO_ACCESS);
  });

  it('refuses a lender who was removed from the room, even for an upload they began earlier', async () => {
    const room = await newRoom('Departed Bank');
    await addMember(room, lender);
    const sent = await sendFile(lender, room, 'late.pdf', strToU8('late'));

    await admin
      .from('lender_room_member')
      .delete()
      .eq('room_id', room.id)
      .throwOnError();

    await expect(register(lender, sent.uploadId)).rejects.toThrow(NO_ACCESS);
    await expect(begin(lender, room, 'x.pdf', 1)).rejects.toThrow(NO_ACCESS);
    expect(await documentsIn(room.folderId)).toEqual([]);
  });

  it('lets the deal team upload into a closed room', async () => {
    const closed = await newRoom('Closed Bank 2', {
      closed_at: new Date().toISOString(),
    });

    await upload(owner, closed, 'final.pdf', strToU8('final'));

    expect(await documentsNamed(closed.folderId, 'final.pdf')).toHaveLength(1);
  });

  it('lets the deal team upload into an expired room', async () => {
    const expired = await newRoom('Expired Bank 2', {
      expires_at: new Date(Date.now() - 60_000).toISOString(),
    });

    await upload(owner, expired, 'final.pdf', strToU8('final'));

    expect(await documentsNamed(expired.folderId, 'final.pdf')).toHaveLength(1);
  });
});

describe('what may be uploaded', { timeout: 60_000 }, () => {
  it('refuses a file over 300 MiB before issuing an upload URL', async () => {
    await expect(
      begin(lender, roomA, 'survey.dwg', MAX_UPLOAD_BYTES + 1),
    ).rejects.toThrow('survey.dwg is larger than the 300 MiB limit');
  });

  it('refuses video before issuing an upload URL', async () => {
    await expect(begin(lender, roomA, 'walkthrough.mp4', 10)).rejects.toThrow(
      'walkthrough.mp4 cannot be uploaded: video and audio files are not allowed',
    );
  });

  it('refuses a name that climbs toward another deal', async () => {
    const name = `a/../../${crypto.randomUUID()}/x.pdf`;

    await expect(begin(lender, roomA, name, 1)).rejects.toThrow(
      `"${name}" cannot be used as a file name`,
    );
  });

  it('stores under a key built only from safe characters while the document keeps the name as given', async () => {
    const name = 'Résumé (final) #1.pdf';
    const sent = await upload(lender, roomA, name, strToU8('cv'));

    expect(sent.path).toMatch(
      new RegExp(`^deal/${dealId}/[0-9a-f-]{36}-R_sum___final___1\\.pdf$`),
    );
    expect(
      (await documentsNamed(roomA.folderId, name)).map(
        (doc) => doc.storage_path,
      ),
    ).toEqual([sent.path]);
  });

  it('registers only the object of the upload itself, whatever path and name the caller adds', async () => {
    const masterPath = `deal/${dealId}/${crypto.randomUUID()}-deck.pptx`;
    await bucket.upload(masterPath, zipSync({ 'slide1.xml': strToU8('s') }));
    const sent = await sendFile(lender, roomA, 'own.txt', strToU8('own'));
    session.user = lender.client;

    await unwrap(
      registerUpload({
        uploadId: sent.uploadId,
        keepAsZip: false,
        path: masterPath,
        name: 'x.zip',
      } as Parameters<typeof registerUpload>[0]),
    );

    expect(await isStored(masterPath)).toBe(true);
    expect(await foldersNamed(roomA.folderId, 'x')).toEqual([]);
    expect(
      (await documentsNamed(roomA.folderId, 'own.txt')).map(
        (doc) => doc.storage_path,
      ),
    ).toEqual([sent.path]);
  });

  it('refuses to register a file that never reached storage', async () => {
    const begun = await begin(lender, roomA, 'ghost.pdf', 5);

    await expect(register(lender, begun.uploadId)).rejects.toThrow(
      'ghost.pdf was not found in storage',
    );
    expect(await documentsNamed(roomA.folderId, 'ghost.pdf')).toEqual([]);
  });

  it('refuses to register a zip that never reached storage', async () => {
    const begun = await begin(lender, roomA, 'Ghost.zip', 5);

    await expect(register(lender, begun.uploadId)).rejects.toThrow(
      'Ghost.zip was not found in storage',
    );
    expect(await foldersNamed(roomA.folderId, 'Ghost')).toEqual([]);
  });

  it('removes a stored object that is refused at registration', async () => {
    const path = `deal/${dealId}/${crypto.randomUUID()}-tour.mov`;
    await bucket.upload(path, strToU8('video'));
    const seeded = await admin
      .from('lender_upload')
      .insert({
        room_id: roomA.id,
        deal_id: dealId,
        folder_id: roomA.folderId,
        name: 'tour.mov',
        storage_path: path,
        uploaded_by: lender.userId,
      })
      .select('id')
      .single()
      .throwOnError();

    await expect(register(lender, seeded.data.id)).rejects.toThrow(
      'tour.mov cannot be uploaded: video and audio files are not allowed',
    );
    expect(await isStored(path)).toBe(false);
    expect(await documentsNamed(roomA.folderId, 'tour.mov')).toEqual([]);
  });
});

describe('registering again', { timeout: 60_000 }, () => {
  it('leaves one document when the same upload is registered twice', async () => {
    const sent = await upload(lender, roomA, 'retry.pdf', strToU8('retry'));

    expect(await register(lender, sent.uploadId)).toEqual(sent.ids);
    expect(await documentsNamed(roomA.folderId, 'retry.pdf')).toHaveLength(1);
  });

  it('registers a second upload of the same name as version 2', async () => {
    await upload(lender, roomA, 'financials.xlsx', strToU8('first'));
    await upload(lender, roomA, 'financials.xlsx', strToU8('second'));

    expect(
      (await documentsNamed(roomA.folderId, 'financials.xlsx')).map(
        (doc) => doc.version,
      ),
    ).toEqual([1, 2]);
  });

  it('returns the same documents and adds nothing when an expanded zip is registered again', async () => {
    const sent = await upload(
      lender,
      roomA,
      'Again.zip',
      zipSync({ 'a.txt': strToU8('a'), 'sub/b.txt': strToU8('b') }),
    );

    expect(await register(lender, sent.uploadId)).toEqual(sent.ids);

    const root = await childFolder(roomA.folderId, 'Again');
    expect(await documentsIn(root)).toHaveLength(1);
    expect(await documentsIn(await childFolder(root, 'sub'))).toHaveLength(1);
  });

  it('never replaces stored entry bytes when new bytes appear at a registered archive key', async () => {
    const sent = await upload(
      lender,
      roomA,
      'Promoted.zip',
      zipSync({ 'terms.txt': strToU8('original') }),
    );
    const [terms] = await documentsIn(
      await childFolder(roomA.folderId, 'Promoted'),
    );

    await bucket.upload(
      sent.path,
      zipSync({ 'terms.txt': strToU8('tampered') }),
    );
    await register(lender, sent.uploadId);

    expect(await (await storedObject(terms!.storage_path)).text()).toBe(
      'original',
    );
    expect(await foldersNamed(roomA.folderId, 'Promoted (2)')).toEqual([]);
  });

  it('re-runs an expansion whose first attempt stopped before it was recorded, without duplicating anything', async () => {
    const archive = zipSync({
      'a.txt': strToU8('a'),
      'sub/b.txt': strToU8('b'),
    });
    const sent = await upload(lender, roomA, 'Partway.zip', archive);

    await admin
      .from('lender_upload')
      .update({ registered_at: null, document_ids: null })
      .eq('id', sent.uploadId)
      .throwOnError();
    await bucket.upload(sent.path, archive);

    expect(await register(lender, sent.uploadId)).toEqual(sent.ids);

    const root = await childFolder(roomA.folderId, 'Partway');
    expect(await documentsIn(root)).toHaveLength(1);
    expect(await documentsIn(await childFolder(root, 'sub'))).toHaveLength(1);
    expect(await foldersNamed(roomA.folderId, 'Partway (2)')).toEqual([]);
  });

  it('cannot replace an object through the signed upload URL once it is stored', async () => {
    const sent = await sendFile(lender, roomA, 'once.txt', strToU8('first'));

    const again = await lender.client.storage
      .from(BUCKET)
      .uploadToSignedUrl(sent.path, sent.token, strToU8('second'));

    expect(again.error).not.toBeNull();
    expect(await (await storedObject(sent.path)).text()).toBe('first');
  });
});

describe('zip archives', { timeout: 60_000 }, () => {
  it('expands a zip into a folder named after it, with subfolders and nested zips', async () => {
    const sent = await upload(
      lender,
      roomA,
      'Closing Package.zip',
      zipSync({
        'cover.txt': strToU8('cover'),
        'tax/return.txt': strToU8('return'),
        'tax/k1s.zip': zipSync({ 'partner.txt': strToU8('k1') }),
      }),
    );

    const root = await childFolder(roomA.folderId, 'Closing Package');
    const tax = await childFolder(root, 'tax');
    const k1s = await childFolder(tax, 'k1s');

    expect(sent.ids).toHaveLength(3);
    expect((await documentsIn(root)).map((doc) => doc.name)).toEqual([
      'cover.txt',
    ]);
    expect((await documentsIn(tax)).map((doc) => doc.name)).toEqual([
      'return.txt',
    ]);
    expect((await documentsIn(k1s)).map((doc) => doc.name)).toEqual([
      'partner.txt',
    ]);
  });

  it('does not list the expanded archive as a document and removes it from storage', async () => {
    const sent = await upload(
      lender,
      roomA,
      'Gone.zip',
      zipSync({ 'a.txt': strToU8('a') }),
    );

    expect(await documentsNamed(roomA.folderId, 'Gone.zip')).toEqual([]);
    expect(await isStored(sent.path)).toBe(false);
  });

  it('stores each entry under the archive key with a safe name and its own bytes', async () => {
    const sent = await upload(
      lender,
      roomA,
      'Entries.zip',
      zipSync({ 'dir/café menu.txt': strToU8('latte') }),
    );
    const [menu] = await documentsIn(
      await childFolder(await childFolder(roomA.folderId, 'Entries'), 'dir'),
    );

    expect(menu!.name).toBe('café menu.txt');
    expect(menu!.storage_path).toBe(`${sent.path}/0-caf__menu.txt`);
    expect(await (await storedObject(menu!.storage_path)).text()).toBe('latte');
  });

  it('stores an expanded entry with the content type its extension implies', async () => {
    await upload(
      lender,
      roomA,
      'Typed.zip',
      zipSync({ 'report.pdf': strToU8('%PDF-1.7') }),
    );
    const [report] = await documentsIn(
      await childFolder(roomA.folderId, 'Typed'),
    );

    expect((await storedObject(report!.storage_path)).type).toBe(
      'application/pdf',
    );
  });

  it('accepts an upload into a folder that an expansion created', async () => {
    await upload(
      lender,
      roomA,
      'Nest.zip',
      zipSync({ 'tax/return.txt': strToU8('r') }),
    );
    const tax = await childFolder(
      await childFolder(roomA.folderId, 'Nest'),
      'tax',
    );

    await upload(lender, roomA, 'amended.txt', strToU8('amended'), tax);

    expect((await documentsIn(tax)).map((doc) => doc.name).sort()).toEqual([
      'amended.txt',
      'return.txt',
    ]);
  });

  it('keeps a zip as one ordinary file when asked to', async () => {
    const sent = await sendFile(
      lender,
      roomA,
      'keep-me.zip',
      zipSync({ 'inside.txt': strToU8('inside') }),
    );

    const ids = await register(lender, sent.uploadId, true);

    expect(ids).toHaveLength(1);
    expect(
      (await documentsNamed(roomA.folderId, 'keep-me.zip')).map(
        (doc) => doc.storage_path,
      ),
    ).toEqual([sent.path]);
    expect(await foldersNamed(roomA.folderId, 'keep-me')).toEqual([]);
  });

  it('records a zip entry over 300 MiB as a too-large placeholder the lender can see', async () => {
    const archive = zipSync({
      'survey.dwg': strToU8('s'),
      'legend.txt': strToU8('legend'),
    });
    const view = new DataView(archive.buffer, archive.byteOffset);
    const surveyEntry = Buffer.from(archive).lastIndexOf('survey.dwg') - 46;

    view.setUint32(surveyEntry + 24, MAX_UPLOAD_BYTES + 1, true);
    await upload(lender, roomA, 'media.zip', archive);

    const media = await childFolder(roomA.folderId, 'media');
    const placeholders = await lender.client
      .from('lender_oversize_file')
      .select('name, size_bytes')
      .eq('dr_folder_id', media)
      .throwOnError();

    expect(placeholders.data).toEqual([
      { name: 'survey.dwg', size_bytes: MAX_UPLOAD_BYTES + 1 },
    ]);
    expect((await documentsIn(media)).map((doc) => doc.name)).toEqual([
      'legend.txt',
    ]);
  });

  it('numbers an expanded folder instead of merging into one with the same name', async () => {
    const existing = await newFolder('Forms', roomA.folderId);
    const archive = zipSync({ 'w9.txt': strToU8('w9') });

    await upload(lender, roomA, 'Forms.zip', archive);
    await upload(lender, roomA, 'Forms.zip', archive);

    expect(await documentsIn(existing)).toEqual([]);
    expect(
      await documentsIn(await childFolder(roomA.folderId, 'Forms (2)')),
    ).toHaveLength(1);
    expect(
      await documentsIn(await childFolder(roomA.folderId, 'Forms (3)')),
    ).toHaveLength(1);
  });

  it('numbers an expanded folder that differs only by case from one already there', async () => {
    await newFolder('Statements', roomA.folderId);

    await upload(
      lender,
      roomA,
      'statements.zip',
      zipSync({ 'a.txt': strToU8('a') }),
    );

    expect(
      await documentsIn(await childFolder(roomA.folderId, 'statements (2)')),
    ).toHaveLength(1);
  });

  it('puts zip directories that differ only by case into one folder', async () => {
    await upload(
      lender,
      roomA,
      'Mixedcase.zip',
      zipSync({ 'Tax/a.txt': strToU8('a'), 'tax/b.txt': strToU8('b') }),
    );
    const root = await childFolder(roomA.folderId, 'Mixedcase');

    expect(
      (await documentsIn(await childFolder(root, 'Tax')))
        .map((doc) => doc.name)
        .sort(),
    ).toEqual(['a.txt', 'b.txt']);
    expect(await foldersNamed(root, 'tax')).toEqual([]);
  });

  it('makes an empty folder for an empty archive', async () => {
    const sent = await upload(lender, roomA, 'Blank.zip', zipSync({}));

    expect(sent.ids).toEqual([]);
    expect(
      await documentsIn(await childFolder(roomA.folderId, 'Blank')),
    ).toEqual([]);
  });

  it('keeps a password-protected zip as one ordinary file', async () => {
    const sent = await upload(lender, roomA, 'Locked.zip', ENCRYPTED_ZIP);

    expect(
      (await documentsNamed(roomA.folderId, 'Locked.zip')).map((doc) => [
        doc.id,
        doc.storage_path,
      ]),
    ).toEqual([[sent.ids[0], sent.path]]);
    expect(await foldersNamed(roomA.folderId, 'Locked')).toEqual([]);
  });

  it('keeps a zip nested more than 3 deep as one ordinary file', async () => {
    const sent = await upload(
      lender,
      roomA,
      'Deep.zip',
      zipSync({
        'two.zip': zipSync({
          'three.zip': zipSync({
            'four.zip': zipSync({ 'leaf.txt': strToU8('l') }),
          }),
        }),
      }),
    );

    expect(
      (await documentsNamed(roomA.folderId, 'Deep.zip')).map(
        (doc) => doc.storage_path,
      ),
    ).toEqual([sent.path]);
    expect(await foldersNamed(roomA.folderId, 'Deep')).toEqual([]);
  });
});

describe('preview renditions', { timeout: 60_000 }, () => {
  it('stores a JPEG preview beside a HEIC file', async () => {
    const sent = await upload(lender, roomA, 'site-photo.heic', HEIC_SAMPLE);
    const preview = await storedObject(`${sent.path}.preview.jpg`);

    expect(preview.type).toBe('image/jpeg');
    expect(
      Buffer.from(await preview.arrayBuffer())
        .subarray(0, 3)
        .toString('hex'),
    ).toBe('ffd8ff');
  });

  it('does not list a preview as a document', async () => {
    await upload(lender, roomA, 'listed-once.heic', HEIC_SAMPLE);

    expect(
      (await documentsIn(roomA.folderId))
        .filter((doc) => doc.name.startsWith('listed-once'))
        .map((doc) => doc.name),
    ).toEqual(['listed-once.heic']);
  });

  it('stores a JPEG preview for a HEIF file that arrives inside a zip', async () => {
    await upload(
      lender,
      roomA,
      'photos.zip',
      zipSync({ 'IMG_0001.HEIF': HEIC_SAMPLE }),
    );
    const [photo] = await documentsIn(
      await childFolder(roomA.folderId, 'photos'),
    );

    expect(
      (await storedObject(`${photo!.storage_path}.preview.jpg`)).type,
    ).toBe('image/jpeg');
  });

  it('stores the converted PDF beside a PowerPoint file', async () => {
    const sent = await upload(
      lender,
      roomA,
      'Pitch.pptx',
      strToU8('direct slides'),
    );
    const preview = await storedObject(`${sent.path}.preview.pdf`);

    expect(preview.type).toBe('application/pdf');
    expect(await preview.text()).toBe('%PDF-1.7 of direct slides');
  });

  it('stores the converted PDF for a PowerPoint file that arrives inside a zip', async () => {
    await upload(
      lender,
      roomA,
      'Decks.zip',
      zipSync({ 'Board.PPTX': strToU8('zipped slides') }),
    );
    const [board] = await documentsIn(
      await childFolder(roomA.folderId, 'Decks'),
    );

    expect(
      await (await storedObject(`${board!.storage_path}.preview.pdf`)).text(),
    ).toBe('%PDF-1.7 of zipped slides');
  });

  it('still registers a PowerPoint file, without a preview, when the conversion fails', async () => {
    const sent = await sendFile(
      lender,
      roomA,
      'Unconverted.pptx',
      strToU8('slides'),
    );

    converter.working = false;
    const ids = await register(lender, sent.uploadId).finally(() => {
      converter.working = true;
    });

    expect(
      (await documentsNamed(roomA.folderId, 'Unconverted.pptx')).map(
        (doc) => doc.id,
      ),
    ).toEqual(ids);
    expect(await isStored(`${sent.path}.preview.pdf`)).toBe(false);
  });

  it('registers every entry of a zip even when one deck in it cannot be converted', async () => {
    const sent = await sendFile(
      lender,
      roomA,
      'Mixed.zip',
      zipSync({
        'a.txt': strToU8('a'),
        'deck.pptx': strToU8('slides'),
        'z.txt': strToU8('z'),
      }),
    );

    converter.working = false;
    const ids = await register(lender, sent.uploadId).finally(() => {
      converter.working = true;
    });

    expect(ids).toHaveLength(3);
    expect(
      (await documentsIn(await childFolder(roomA.folderId, 'Mixed')))
        .map((doc) => doc.name)
        .sort(),
    ).toEqual(['a.txt', 'deck.pptx', 'z.txt']);
  });
});

describe('who uploaded', { timeout: 60_000 }, () => {
  async function addedBy(documentId: string) {
    const events = await admin
      .from('deal_event')
      .select('payload')
      .eq('aggregate_id', documentId)
      .eq('event_type', 'dr_document.added')
      .throwOnError();

    return events.data.map(
      (event) => (event.payload as { uploaded_by?: string }).uploaded_by,
    );
  }

  it('records the uploader on the event for a direct file', async () => {
    const sent = await upload(lender, roomA, 'signed.pdf', strToU8('s'));

    expect(await addedBy(sent.ids[0]!)).toEqual([lender.userId]);
  });

  it('records the uploader on the event for each zip entry', async () => {
    const sent = await upload(
      owner,
      roomA,
      'Authored.zip',
      zipSync({ 'a.txt': strToU8('a') }),
    );

    expect(await addedBy(sent.ids[0]!)).toEqual([owner.userId]);
  });
});

describe('names with stray whitespace', { timeout: 60_000 }, () => {
  it('refuses a video whose name ends in a space', async () => {
    await expect(begin(lender, roomA, 'clip.mp4 ', 10)).rejects.toThrow(
      'clip.mp4 cannot be uploaded: video and audio files are not allowed',
    );
  });

  it('expands a zip whose name ends in a space, under the trimmed name', async () => {
    await upload(
      lender,
      roomA,
      'Trimmed.zip ',
      zipSync({ 'a.txt': strToU8('a') }),
    );

    expect(
      await documentsIn(await childFolder(roomA.folderId, 'Trimmed')),
    ).toHaveLength(1);
  });

  it('stores a document under its trimmed name', async () => {
    await upload(lender, roomA, '  padded.pdf ', strToU8('p'));

    expect(await documentsNamed(roomA.folderId, 'padded.pdf')).toHaveLength(1);
  });
});

describe('cancelling an upload', { timeout: 60_000 }, () => {
  const NOT_FOUND = 'That upload was not found';
  let colleague: Person;

  beforeAll(async () => {
    colleague = await provisionPerson();
    await addMember(roomA, colleague);
  }, 60_000);

  afterAll(async () => {
    await admin.auth.admin.deleteUser(colleague.userId);
  });

  it('removes the stored object and forgets the upload', async () => {
    const sent = await sendFile(lender, roomA, 'wrong.pdf', strToU8('wrong'));

    await cancel(lender, sent.uploadId);

    expect(await isStored(sent.path)).toBe(false);
    expect(await uploadRows(sent.uploadId)).toEqual([]);
  });

  it('forgets an upload whose bytes never reached storage', async () => {
    const begun = await begin(lender, roomA, 'never-sent.pdf', 5);

    await cancel(lender, begun.uploadId);

    expect(await uploadRows(begun.uploadId)).toEqual([]);
  });

  it('refuses another member of the same room', async () => {
    const sent = await sendFile(lender, roomA, 'theirs.pdf', strToU8('t'));

    await expect(cancel(colleague, sent.uploadId)).rejects.toThrow(NOT_FOUND);
    expect(await isStored(sent.path)).toBe(true);
    expect(await uploadRows(sent.uploadId)).toHaveLength(1);
  });

  it('refuses an upload that is already in the room, and its document stays', async () => {
    const sent = await upload(lender, roomA, 'kept.pdf', strToU8('kept'));

    await expect(cancel(lender, sent.uploadId)).rejects.toThrow(
      /^That file has already been added$/,
    );
    expect(await documentsNamed(roomA.folderId, 'kept.pdf')).toHaveLength(1);
    expect(await isStored(sent.path)).toBe(true);
  });

  it('refuses a second cancel of the same upload', async () => {
    const sent = await sendFile(lender, roomA, 'twice.pdf', strToU8('t'));

    await cancel(lender, sent.uploadId);

    await expect(cancel(lender, sent.uploadId)).rejects.toThrow(NOT_FOUND);
  });

  it('refuses an upload that does not exist', async () => {
    await expect(cancel(lender, crypto.randomUUID())).rejects.toThrow(
      NOT_FOUND,
    );
  });
});

describe('folders a lender makes', { timeout: 60_000 }, () => {
  const WRONG_PLACE = "Folders can only be added to the room's own folder";
  const CANNOT_ADD = 'That folder cannot be added';

  let closed: Room;
  let expired: Room;
  let departed: Room;
  let otherDealFolderId: string;

  function newFolderIn(
    person: Person,
    room: Room,
    name: string,
    parentFolderId = room.folderId,
  ) {
    session.user = person.client;

    return unwrap(createFolder({ roomId: room.id, parentFolderId, name }));
  }

  function newTreeIn(
    person: Person,
    room: Room,
    rootName: string,
    paths: string[],
    parentFolderId = room.folderId,
  ) {
    session.user = person.client;

    return unwrap(
      createFolderTree({ roomId: room.id, parentFolderId, rootName, paths }),
    );
  }

  async function folder(id: string) {
    const row = await admin
      .from('dr_folder')
      .select('name, parent_id, deal_id, account_id')
      .eq('id', id)
      .single()
      .throwOnError();

    return row.data;
  }

  beforeAll(async () => {
    closed = await newRoom('Closed Folders Bank', {
      closed_at: new Date().toISOString(),
    });
    expired = await newRoom('Expired Folders Bank', {
      expires_at: new Date(Date.now() - 60_000).toISOString(),
    });
    departed = await newRoom('Departed Folders Bank');
    await Promise.all(
      [closed, expired, departed].map((room) => addMember(room, lender)),
    );
    await admin
      .from('lender_room_member')
      .delete()
      .eq('room_id', departed.id)
      .throwOnError();

    const otherDealId = crypto.randomUUID();
    await appendDealEvent(owner.client, {
      dealId: otherDealId,
      aggregateType: 'deal',
      aggregateId: otherDealId,
      eventType: 'deal.created',
      payload: {
        account_id: owner.accountId,
        owner_user_id: owner.userId,
        firm_id: null,
        description: 'Another deal',
        source: 'manual',
        stage: 'sourcing',
      },
    });
    const otherDealFolder = await admin
      .from('dr_folder')
      .insert({
        account_id: owner.accountId,
        deal_id: otherDealId,
        name: 'Other deal',
      })
      .select('id')
      .single()
      .throwOnError();
    otherDealFolderId = otherDealFolder.data.id;
  }, 60_000);

  describe('one new folder', () => {
    it('makes a folder in the room that the lender can then see', async () => {
      const id = await newFolderIn(lender, roomA, 'Appraisals');

      const visible = await lender.client
        .from('dr_folder')
        .select('name, parent_id')
        .eq('id', id)
        .throwOnError();

      expect(visible.data).toEqual([
        { name: 'Appraisals', parent_id: roomA.folderId },
      ]);
      expect(await folder(id)).toMatchObject({
        deal_id: dealId,
        account_id: owner.accountId,
      });
    });

    it('makes a folder inside a folder the lender made', async () => {
      const outer = await newFolderIn(lender, roomA, 'Outer');
      const inner = await newFolderIn(lender, roomA, 'Inner', outer);

      expect((await folder(inner)).parent_id).toBe(outer);
    });

    it('lets the deal team make a folder in the room', async () => {
      const id = await newFolderIn(owner, roomA, 'From the deal team');

      expect((await folder(id)).name).toBe('From the deal team');
    });

    it('trims whitespace around the name', async () => {
      const id = await newFolderIn(lender, roomA, '  Spaced  ');

      expect((await folder(id)).name).toBe('Spaced');
    });

    it('refuses a name already used under that parent', async () => {
      await newFolderIn(lender, roomA, 'Insurance');

      await expect(newFolderIn(lender, roomA, 'Insurance')).rejects.toThrow(
        'A folder named "Insurance" is already here',
      );
      expect(await foldersNamed(roomA.folderId, 'Insurance')).toHaveLength(1);
    });

    it('refuses a name that differs only by case, quoting the folder already there', async () => {
      await newFolderIn(lender, roomA, 'Tax');

      await expect(newFolderIn(lender, roomA, 'tax')).rejects.toThrow(
        'A folder named "Tax" is already here',
      );
      expect(await foldersNamed(roomA.folderId, 'tax')).toEqual([]);
    });

    it('does not mistake a wildcard in the name for a match', async () => {
      await newFolderIn(lender, roomA, 'Q1 notes');

      const id = await newFolderIn(lender, roomA, 'Q_ n%');

      expect((await folder(id)).name).toBe('Q_ n%');
    });

    it.each([
      ['starting with a dot', '.hidden'],
      ['containing a slash', 'a/b'],
    ])('refuses a name %s', async (_, name) => {
      await expect(newFolderIn(lender, roomA, name)).rejects.toThrow(
        `"${name}" cannot be used as a folder name`,
      );
    });

    it('asks for a name when it is blank', async () => {
      await expect(newFolderIn(lender, roomA, '   ')).rejects.toThrow(
        /^Enter a folder name$/,
      );
    });
  });

  describe('a dropped folder', () => {
    it('makes the root and every directory under it, returning each id', async () => {
      const tree = await newTreeIn(lender, roomA, 'Dropped', [
        'tax',
        'tax/2024',
        'legal',
      ]);

      expect(Object.keys(tree.folderIds).sort()).toEqual([
        'legal',
        'tax',
        'tax/2024',
      ]);
      expect(await folder(tree.rootFolderId!)).toMatchObject({
        name: 'Dropped',
        parent_id: roomA.folderId,
        deal_id: dealId,
      });
      expect(await folder(tree.folderIds['tax']!)).toMatchObject({
        name: 'tax',
        parent_id: tree.rootFolderId,
      });
      expect(await folder(tree.folderIds['tax/2024']!)).toMatchObject({
        name: '2024',
        parent_id: tree.folderIds['tax'],
      });
      expect(await folder(tree.folderIds['legal']!)).toMatchObject({
        name: 'legal',
        parent_id: tree.rootFolderId,
      });
    });

    it('makes the parents a path implies', async () => {
      const tree = await newTreeIn(lender, roomA, 'Implied', ['a/b']);

      expect((await folder(tree.folderIds['a/b']!)).parent_id).toBe(
        tree.folderIds['a'],
      );
    });

    it('accepts an upload into a folder it returned', async () => {
      const tree = await newTreeIn(lender, roomA, 'Receiving', ['docs']);

      await upload(
        lender,
        roomA,
        'memo.txt',
        strToU8('memo'),
        tree.folderIds['docs'],
      );

      expect(
        await documentsNamed(tree.folderIds['docs']!, 'memo.txt'),
      ).toHaveLength(1);
    });

    it('numbers the root instead of merging into a folder with the same name', async () => {
      const first = await newTreeIn(lender, roomA, 'Twice', ['a']);
      const second = await newTreeIn(lender, roomA, 'Twice', ['a']);
      const third = await newTreeIn(lender, roomA, 'Twice', ['a']);

      expect((await folder(first.rootFolderId!)).name).toBe('Twice');
      expect((await folder(second.rootFolderId!)).name).toBe('Twice (2)');
      expect((await folder(third.rootFolderId!)).name).toBe('Twice (3)');
    });

    it('numbers a root that differs only by case from a folder already there', async () => {
      await newFolderIn(lender, roomA, 'Ledgers');

      const tree = await newTreeIn(lender, roomA, 'ledgers', []);

      expect((await folder(tree.rootFolderId!)).name).toBe('ledgers (2)');
    });

    it('numbers a root holding wildcard characters only against its own name', async () => {
      await newFolderIn(lender, roomA, '100abc_done');

      const first = await newTreeIn(lender, roomA, '100%_done', []);
      const second = await newTreeIn(lender, roomA, '100%_done', []);

      expect((await folder(first.rootFolderId!)).name).toBe('100%_done');
      expect((await folder(second.rootFolderId!)).name).toBe('100%_done (2)');
    });

    it('refuses a root whose numbered name would pass 255 characters', async () => {
      const rootName = 'n'.repeat(253);
      await newFolderIn(lender, roomA, rootName);

      await expect(newTreeIn(lender, roomA, rootName, [])).rejects.toThrow(
        CANNOT_ADD,
      );
      expect(await foldersNamed(roomA.folderId, `${rootName} (2)`)).toEqual([]);
    });

    it('makes one folder for paths that differ only by case and returns it under every key sent', async () => {
      const tree = await newTreeIn(lender, roomA, 'Cased', [
        'Tax',
        'tax/2024',
        'TAX',
      ]);

      expect(tree.folderIds['tax']).toBeUndefined();
      expect(tree.folderIds['TAX']).toBe(tree.folderIds['Tax']);
      expect(await folder(tree.folderIds['Tax']!)).toMatchObject({
        name: 'Tax',
        parent_id: tree.rootFolderId,
      });
      expect((await folder(tree.folderIds['tax/2024']!)).parent_id).toBe(
        tree.folderIds['Tax'],
      );
      expect(await foldersNamed(tree.rootFolderId!, 'TAX')).toEqual([]);
    });

    it('trims each segment and returns the folder under the path as sent', async () => {
      const tree = await newTreeIn(lender, roomA, 'Padded', [' tax / 2024 ']);

      expect((await folder(tree.folderIds[' tax / 2024 ']!)).name).toBe('2024');
    });

    it('leaves out a directory whose name starts with a dot, with everything beneath it', async () => {
      const tree = await newTreeIn(lender, roomA, 'Repo', [
        'src',
        '.git',
        '.git/hooks',
      ]);

      expect(Object.keys(tree.folderIds)).toEqual(['src']);
      expect(await foldersNamed(tree.rootFolderId!, '.git')).toEqual([]);
    });

    it('leaves out a macOS resource directory', async () => {
      const tree = await newTreeIn(lender, roomA, 'Mac', ['docs', '__MACOSX']);

      expect(Object.keys(tree.folderIds)).toEqual(['docs']);
    });

    it('creates nothing, without an error, for a dropped folder whose own name starts with a dot', async () => {
      expect(await newTreeIn(lender, roomA, '.cache', ['a'])).toEqual({
        rootFolderId: null,
        folderIds: {},
      });
      expect(await foldersNamed(roomA.folderId, '.cache')).toEqual([]);
    });

    it.each([
      ['a .. segment', ['ok', '../escape']],
      ['an empty segment', ['ok', 'a//b']],
      ['a drive segment', ['ok', 'c:/b']],
      ['a segment that cannot be a name', ['ok', 'a\\b']],
    ])('refuses %s and creates nothing', async (label, paths) => {
      const rootName = `Refused ${label}`;

      await expect(newTreeIn(lender, roomA, rootName, paths)).rejects.toThrow(
        CANNOT_ADD,
      );
      expect(await foldersNamed(roomA.folderId, rootName)).toEqual([]);
    });

    it('says so when folders are nested more than 20 levels deep, and creates nothing', async () => {
      await expect(
        newTreeIn(lender, roomA, 'Deep', [Array(21).fill('d').join('/')]),
      ).rejects.toThrow(
        '"Deep" has folders nested too deeply (limit 20 levels)',
      );
      expect(await foldersNamed(roomA.folderId, 'Deep')).toEqual([]);
    });

    it('says so when distinct folders pass 2,000 through the parents they imply, and creates nothing', async () => {
      await expect(
        newTreeIn(
          lender,
          roomA,
          'Wide',
          Array.from({ length: 1000 }, (_, index) => `a${index}/b`),
        ),
      ).rejects.toThrow(
        '"Wide" has too many folders to add at once (limit 2,000)',
      );
      expect(await foldersNamed(roomA.folderId, 'Wide')).toEqual([]);
    });

    it('says so for a list longer than 2,000 paths, even of one repeated path', async () => {
      await expect(
        newTreeIn(lender, roomA, 'Long', Array(2001).fill('same')),
      ).rejects.toThrow(
        '"Long" has too many folders to add at once (limit 2,000)',
      );
      expect(await foldersNamed(roomA.folderId, 'Long')).toEqual([]);
    });
  });

  describe('what the room remembers', () => {
    async function folderCreations(room: Room) {
      const rows = await admin
        .from('lender_room_activity')
        .select('user_id, side, dr_folder_id')
        .eq('room_id', room.id)
        .eq('action', 'folder_created')
        .throwOnError();

      return rows.data;
    }

    async function quietRoom(name: string): Promise<Room> {
      const room = await newRoom(name);
      await addMember(room, lender);

      return room;
    }

    it('records a new folder as made by the lender who made it', async () => {
      const room = await quietRoom('Remembering Bank 1');
      const id = await newFolderIn(lender, room, 'Recorded');

      expect(await folderCreations(room)).toEqual([
        { user_id: lender.userId, side: 'lender', dr_folder_id: id },
      ]);
    });

    it('records a folder made by the deal team as internal', async () => {
      const room = await quietRoom('Remembering Bank 2');
      const id = await newFolderIn(owner, room, 'Recorded');

      expect(await folderCreations(room)).toEqual([
        { user_id: owner.userId, side: 'internal', dr_folder_id: id },
      ]);
    });

    it('records a whole dropped folder once, against its root', async () => {
      const room = await quietRoom('Remembering Bank 3');
      const tree = await newTreeIn(lender, room, 'Dropped', ['a', 'a/b', 'c']);

      expect(await folderCreations(room)).toEqual([
        {
          user_id: lender.userId,
          side: 'lender',
          dr_folder_id: tree.rootFolderId,
        },
      ]);
    });

    it('records nothing for a skipped dot folder', async () => {
      const room = await quietRoom('Remembering Bank 4');

      await newTreeIn(lender, room, '.cache', ['a']);

      expect(await folderCreations(room)).toEqual([]);
    });

    it('records nothing for a refused folder', async () => {
      const room = await quietRoom('Remembering Bank 5');

      await newFolderIn(lender, room, 'a/b').catch(() => undefined);
      await newTreeIn(lender, room, 'Drop', ['../x']).catch(() => undefined);

      expect(await folderCreations(room)).toEqual([]);
    });
  });

  describe('where folders may go', () => {
    const attempts = [
      [
        'one new folder',
        (room: Room, parentFolderId?: string) =>
          newFolderIn(lender, room, 'Nope', parentFolderId),
      ],
      [
        'a dropped folder',
        (room: Room, parentFolderId?: string) =>
          newTreeIn(lender, room, 'Nope', ['a'], parentFolderId),
      ],
    ] as const;

    it.each(attempts)(
      'refuses %s in a room the lender is not in',
      async (_, attempt) => {
        await expect(attempt(roomB)).rejects.toThrow(NO_ACCESS);
        expect(await foldersNamed(roomB.folderId, 'Nope')).toEqual([]);
      },
    );

    it.each(attempts)('refuses %s in a closed room', async (_, attempt) => {
      await expect(attempt(closed)).rejects.toThrow(NO_ACCESS);
      expect(await foldersNamed(closed.folderId, 'Nope')).toEqual([]);
    });

    it.each(attempts)('refuses %s in an expired room', async (_, attempt) => {
      await expect(attempt(expired)).rejects.toThrow(NO_ACCESS);
      expect(await foldersNamed(expired.folderId, 'Nope')).toEqual([]);
    });

    it.each(attempts)(
      'refuses %s from a removed member',
      async (_, attempt) => {
        await expect(attempt(departed)).rejects.toThrow(NO_ACCESS);
        expect(await foldersNamed(departed.folderId, 'Nope')).toEqual([]);
      },
    );

    it.each(attempts)(
      'refuses %s under the master package',
      async (_, attempt) => {
        await expect(attempt(roomA, masterFolderId)).rejects.toThrow(
          WRONG_PLACE,
        );
        expect(await foldersNamed(masterFolderId, 'Nope')).toEqual([]);
      },
    );

    it.each(attempts)(
      "refuses %s under another room's folder",
      async (_, attempt) => {
        await expect(attempt(roomA, roomB.folderId)).rejects.toThrow(
          WRONG_PLACE,
        );
        expect(await foldersNamed(roomB.folderId, 'Nope')).toEqual([]);
      },
    );

    it.each(attempts)(
      'refuses %s under a folder of another deal',
      async (_, attempt) => {
        await expect(attempt(roomA, otherDealFolderId)).rejects.toThrow(
          WRONG_PLACE,
        );
        expect(await foldersNamed(otherDealFolderId, 'Nope')).toEqual([]);
      },
    );

    it.each(attempts)(
      'refuses %s under a parent that does not exist',
      async (_, attempt) => {
        await expect(attempt(roomA, crypto.randomUUID())).rejects.toThrow(
          WRONG_PLACE,
        );
      },
    );

    it('gives someone outside the room only the access refusal for an unusable name', async () => {
      await expect(newFolderIn(stranger, roomA, 'a/b')).rejects.toThrow(
        NO_ACCESS,
      );
    });

    it('gives someone outside the room only the access refusal for an unusable tree', async () => {
      await expect(
        newTreeIn(stranger, roomA, 'Drop', ['../escape']),
      ).rejects.toThrow(NO_ACCESS);
    });
  });
});

describe('limits on a room', { timeout: 120_000 }, () => {
  const TOO_DEEP = 'Folders cannot be nested more than 20 levels deep';
  const ROOM_FULL = 'This room has reached its limit of 5,000 folders';

  function makeFolder(room: Room, name: string, parentFolderId: string) {
    session.user = lender.client;

    return unwrap(createFolder({ roomId: room.id, parentFolderId, name }));
  }

  function dropFolder(
    room: Room,
    rootName: string,
    paths: string[],
    parentFolderId: string,
  ) {
    session.user = lender.client;

    return unwrap(
      createFolderTree({ roomId: room.id, parentFolderId, rootName, paths }),
    );
  }

  async function memberRoom(name: string): Promise<Room> {
    const room = await newRoom(name);
    await addMember(room, lender);

    return room;
  }

  async function fill(room: Room, count: number) {
    for (let start = 0; start < count; start += 1000) {
      await admin
        .from('dr_folder')
        .insert(
          Array.from({ length: Math.min(1000, count - start) }, (_, index) => ({
            account_id: owner.accountId,
            deal_id: dealId,
            parent_id: room.folderId,
            name: `filler ${start + index}`,
          })),
        )
        .throwOnError();
    }
  }

  describe('depth', () => {
    let deep: Room;
    let atLevel: string[];

    beforeAll(async () => {
      deep = await memberRoom('Deep Bank');
      atLevel = [deep.folderId];

      for (let level = 1; level <= 21; level += 1) {
        atLevel.push(await newFolder(`level ${level}`, atLevel[level - 1]));
      }
    }, 120_000);

    it('makes a folder at level 20', async () => {
      const id = await makeFolder(deep, 'Twentieth', atLevel[19]!);

      expect(await foldersNamed(atLevel[19]!, 'Twentieth')).toEqual([id]);
    });

    it('refuses a folder that would sit at level 21', async () => {
      await expect(makeFolder(deep, 'Too far', atLevel[20]!)).rejects.toThrow(
        TOO_DEEP,
      );
      expect(await foldersNamed(atLevel[20]!, 'Too far')).toEqual([]);
    });

    it('makes a dropped tree whose deepest folder sits at level 20', async () => {
      const tree = await dropFolder(deep, 'Fits', ['a'], atLevel[18]!);

      expect(Object.keys(tree.folderIds)).toEqual(['a']);
    });

    it('refuses a dropped tree whose deepest folder would sit at level 21', async () => {
      await expect(
        dropFolder(deep, 'Overhang', ['a'], atLevel[19]!),
      ).rejects.toThrow(
        '"Overhang" has folders nested too deeply (limit 20 levels)',
      );
      expect(await foldersNamed(atLevel[19]!, 'Overhang')).toEqual([]);
    });

    it('refuses a dropped folder under a parent already at level 20', async () => {
      await expect(
        dropFolder(deep, 'Bottom', [], atLevel[20]!),
      ).rejects.toThrow(
        '"Bottom" has folders nested too deeply (limit 20 levels)',
      );
    });

    it('expands a zip whose folder lands at level 20', async () => {
      await upload(
        lender,
        deep,
        'Shallow.zip',
        zipSync({ 'a.txt': strToU8('a') }),
        atLevel[19],
      );

      expect(
        await documentsIn(await childFolder(atLevel[19]!, 'Shallow')),
      ).toHaveLength(1);
    });

    it('keeps a zip as one file when expanding it would pass level 20', async () => {
      await upload(
        lender,
        deep,
        'Overdeep.zip',
        zipSync({ 'sub/a.txt': strToU8('a') }),
        atLevel[19],
      );

      expect(await documentsNamed(atLevel[19]!, 'Overdeep.zip')).toHaveLength(
        1,
      );
      expect(await foldersNamed(atLevel[19]!, 'Overdeep')).toEqual([]);
    });

    it('accepts a file into a folder at level 20', async () => {
      await upload(lender, deep, 'deep.txt', strToU8('d'), atLevel[20]);

      expect(await documentsNamed(atLevel[20]!, 'deep.txt')).toHaveLength(1);
    });

    it('does not look further than 20 levels up for the room folder', async () => {
      await expect(
        begin(lender, deep, 'x.pdf', 1, atLevel[21]),
      ).rejects.toThrow(WRONG_FOLDER);
    });
  });

  describe('folder count', () => {
    let full: Room;
    let lastFolderId: string;

    beforeAll(async () => {
      full = await memberRoom('Full Bank');
      await fill(full, 4999);
      lastFolderId = await makeFolder(full, 'Last one', full.folderId);
    }, 120_000);

    afterAll(async () => {
      await admin
        .from('dr_folder')
        .delete()
        .eq('parent_id', full.folderId)
        .throwOnError();
    });

    it('makes the 5,000th folder', async () => {
      expect(await foldersNamed(full.folderId, 'Last one')).toEqual([
        lastFolderId,
      ]);
    });

    it('refuses a new folder in a room that already has 5,000', async () => {
      await expect(makeFolder(full, 'One more', full.folderId)).rejects.toThrow(
        ROOM_FULL,
      );
      expect(await foldersNamed(full.folderId, 'One more')).toEqual([]);
    });

    it('refuses a dropped folder that would pass 5,000, creating nothing', async () => {
      await expect(
        dropFolder(full, 'Overflow', ['a'], full.folderId),
      ).rejects.toThrow(ROOM_FULL);
      expect(await foldersNamed(full.folderId, 'Overflow')).toEqual([]);
    });

    it('keeps a zip as one file when expanding it would pass 5,000', async () => {
      await upload(
        lender,
        full,
        'Spill.zip',
        zipSync({ 'a.txt': strToU8('a') }),
      );

      expect(await documentsNamed(full.folderId, 'Spill.zip')).toHaveLength(1);
      expect(await foldersNamed(full.folderId, 'Spill')).toEqual([]);
    });
  });
});

describe(
  'folders the deal team adds to the lender package',
  { timeout: 120_000 },
  () => {
    const NO_PACKAGE_ACCESS = 'You do not have access to this lender package';
    const OUTSIDE_PACKAGE = 'Folders can only be added to the lender package';

    interface Package {
      dealId: string;
      masterFolderId: string;
    }

    function packageFolder(
      person: Person,
      target: Package,
      name: string,
      parentFolderId = target.masterFolderId,
    ) {
      session.user = person.client;

      return unwrap(
        createFolder({ dealId: target.dealId, parentFolderId, name }),
      );
    }

    function packageTree(
      person: Person,
      target: Package,
      rootName: string,
      paths: string[],
      parentFolderId = target.masterFolderId,
    ) {
      session.user = person.client;

      return unwrap(
        createFolderTree({
          dealId: target.dealId,
          parentFolderId,
          rootName,
          paths,
        }),
      );
    }

    async function packageUpload(
      person: Person,
      target: Package,
      name: string,
      bytes: Uint8Array,
      folderId = target.masterFolderId,
    ) {
      session.user = person.client;
      const begun = await unwrap(
        beginUpload({
          dealId: target.dealId,
          folderId,
          name,
          size: bytes.length,
        }),
      );
      const stored = await person.client.storage
        .from(BUCKET)
        .uploadToSignedUrl(begun.path, begun.token, bytes);

      if (stored.error) {
        throw stored.error;
      }

      return { ...begun, ids: await register(person, begun.uploadId) };
    }

    async function dealOwnedBy(person: Person): Promise<string> {
      const id = crypto.randomUUID();
      await appendDealEvent(person.client, {
        dealId: id,
        aggregateType: 'deal',
        aggregateId: id,
        eventType: 'deal.created',
        payload: {
          account_id: person.accountId,
          owner_user_id: person.userId,
          firm_id: null,
          description: 'Package deal',
          source: 'manual',
          stage: 'sourcing',
        },
      });

      return id;
    }

    async function folderInDeal(
      deal: string,
      name: string,
      parentId?: string,
    ): Promise<string> {
      const folder = await admin
        .from('dr_folder')
        .insert({
          account_id: owner.accountId,
          deal_id: deal,
          name,
          parent_id: parentId,
        })
        .select('id')
        .single()
        .throwOnError();

      return folder.data.id;
    }

    async function newPackage(): Promise<Package> {
      const deal = await dealOwnedBy(owner);
      const masterFolderId = await folderInDeal(deal, 'Lender package');
      await admin
        .from('lender_package')
        .insert({
          deal_id: deal,
          account_id: owner.accountId,
          master_folder_id: masterFolderId,
        })
        .throwOnError();

      return { dealId: deal, masterFolderId };
    }

    let shared: Package;

    beforeAll(() => {
      shared = { dealId, masterFolderId };
    });

    it('makes a folder in the package that a lender in an open room can see', async () => {
      const id = await packageFolder(owner, shared, 'Financials');

      const visible = await lender.client
        .from('dr_folder')
        .select('name, parent_id')
        .eq('id', id)
        .throwOnError();

      expect(visible.data).toEqual([
        { name: 'Financials', parent_id: masterFolderId },
      ]);
    });

    it('makes a folder inside a package folder', async () => {
      const outer = await packageFolder(owner, shared, 'Outer package');
      const inner = await packageFolder(owner, shared, 'Inner', outer);

      expect(await foldersNamed(outer, 'Inner')).toEqual([inner]);
    });

    it('makes a dropped folder tree in the package', async () => {
      const tree = await packageTree(owner, shared, 'Package drop', [
        'tax',
        'tax/2024',
      ]);

      expect(await foldersNamed(masterFolderId, 'Package drop')).toEqual([
        tree.rootFolderId,
      ]);
      expect(await foldersNamed(tree.folderIds['tax']!, '2024')).toEqual([
        tree.folderIds['tax/2024'],
      ]);
    });

    it('applies the same name rules as a room', async () => {
      await packageFolder(owner, shared, 'Appraisal');

      await expect(packageFolder(owner, shared, 'appraisal')).rejects.toThrow(
        'A folder named "Appraisal" is already here',
      );
    });

    it('records no room activity for a package folder', async () => {
      const id = await packageFolder(owner, shared, 'Unrecorded');

      const rows = await admin
        .from('lender_room_activity')
        .select('id')
        .eq('dr_folder_id', id)
        .throwOnError();

      expect(rows.data).toEqual([]);
    });

    it('refuses a lender aiming at the package', async () => {
      await expect(packageFolder(lender, shared, 'Sneaky')).rejects.toThrow(
        NO_PACKAGE_ACCESS,
      );
      expect(await foldersNamed(masterFolderId, 'Sneaky')).toEqual([]);
    });

    it('refuses a dropped tree from a lender aiming at the package', async () => {
      await expect(
        packageTree(lender, shared, 'Sneaky tree', ['a']),
      ).rejects.toThrow(NO_PACKAGE_ACCESS);
      expect(await foldersNamed(masterFolderId, 'Sneaky tree')).toEqual([]);
    });

    it('refuses someone with no part in the deal', async () => {
      await expect(packageFolder(stranger, shared, 'Nope')).rejects.toThrow(
        NO_PACKAGE_ACCESS,
      );
    });

    it("refuses a folder outside the package, such as a room's own folder", async () => {
      await expect(
        packageFolder(owner, shared, 'Misplaced', roomA.folderId),
      ).rejects.toThrow(OUTSIDE_PACKAGE);
      expect(await foldersNamed(roomA.folderId, 'Misplaced')).toEqual([]);
    });

    it("refuses a folder in another deal's package", async () => {
      const other = await newPackage();

      await expect(
        packageFolder(owner, shared, 'Crossed', other.masterFolderId),
      ).rejects.toThrow(OUTSIDE_PACKAGE);
    });

    it('refuses a new folder that names both a room and the package', async () => {
      session.user = owner.client;

      await expect(
        unwrap(
          createFolder({
            roomId: roomA.id,
            dealId,
            parentFolderId: masterFolderId,
            name: 'Both',
          } as Parameters<typeof createFolder>[0]),
        ),
      ).rejects.toThrow('Add to a room or to the lender package, not both');
      expect(await foldersNamed(masterFolderId, 'Both')).toEqual([]);
      expect(await foldersNamed(roomA.folderId, 'Both')).toEqual([]);
    });

    it('accepts a target with an unrelated extra field, ignoring the field', async () => {
      session.user = owner.client;

      const id = await unwrap(
        createFolder({
          dealId,
          parentFolderId: masterFolderId,
          name: 'Extra field',
          colour: 'blue',
        } as Parameters<typeof createFolder>[0]),
      );

      expect(await foldersNamed(masterFolderId, 'Extra field')).toEqual([id]);
    });

    it('refuses a dropped folder that names both a room and the package', async () => {
      session.user = owner.client;

      await expect(
        unwrap(
          createFolderTree({
            roomId: roomA.id,
            dealId,
            parentFolderId: roomA.folderId,
            rootName: 'Both tree',
            paths: [],
          } as Parameters<typeof createFolderTree>[0]),
        ),
      ).rejects.toThrow('Add to a room or to the lender package, not both');
      expect(await foldersNamed(roomA.folderId, 'Both tree')).toEqual([]);
    });

    it('refuses a deal that has no lender package yet', async () => {
      const bare = await dealOwnedBy(owner);

      await expect(
        packageFolder(owner, { dealId: bare, masterFolderId }, 'Early'),
      ).rejects.toThrow('This deal has no lender package yet');
    });

    it('refuses a folder that would sit 21 levels below the package folder', async () => {
      const deep = await newPackage();
      let parent = deep.masterFolderId;

      for (let level = 1; level <= 20; level += 1) {
        parent = await folderInDeal(deep.dealId, `level ${level}`, parent);
      }

      await expect(
        packageFolder(owner, deep, 'Too far', parent),
      ).rejects.toThrow('Folders cannot be nested more than 20 levels deep');
    });

    describe('files the deal team adds to the package', () => {
      it('registers a file in the package as uploaded by the deal team member', async () => {
        const sent = await packageUpload(
          owner,
          shared,
          'term-sheet.pdf',
          strToU8('terms'),
        );

        expect(
          (await documentsNamed(masterFolderId, 'term-sheet.pdf')).map(
            (doc) => doc.id,
          ),
        ).toEqual(sent.ids);

        const events = await admin
          .from('deal_event')
          .select('actor_kind, payload')
          .eq('aggregate_id', sent.ids[0]!)
          .throwOnError();
        expect(
          events.data.map((event) => [
            event.actor_kind,
            (event.payload as { uploaded_by?: string }).uploaded_by,
          ]),
        ).toEqual([['service', owner.userId]]);
      });

      it('shows a package file to a lender in an open room', async () => {
        const sent = await packageUpload(
          owner,
          shared,
          'shared-model.xlsx',
          strToU8('model'),
        );

        const visible = await lender.client
          .from('dr_document')
          .select('id')
          .eq('id', sent.ids[0]!)
          .throwOnError();
        expect(visible.data).toEqual([{ id: sent.ids[0] }]);
      });

      it('keeps a package file out of a room that hides its folder', async () => {
        const hiddenFolder = await packageFolder(owner, shared, 'Withheld');
        const hiding = await newRoom('Hiding Bank');
        await addMember(hiding, lender);
        await admin
          .from('lender_room_hidden')
          .insert({ room_id: hiding.id, dr_folder_id: hiddenFolder })
          .throwOnError();

        const sent = await packageUpload(
          owner,
          shared,
          'withheld.pdf',
          strToU8('w'),
          hiddenFolder,
        );

        session.user = lender.client;
        const [inHidingRoom, inOpenRoom] = await Promise.all(
          [hiding.id, roomA.id].map(async (roomId) => {
            const shown = await lender.client
              .rpc('lender_room_shows_document', {
                room_id: roomId,
                document_id: sent.ids[0]!,
              })
              .throwOnError();

            return shown.data;
          }),
        );

        expect(inHidingRoom).toBe(false);
        expect(inOpenRoom).toBe(true);
      });

      it('expands a zip in the package', async () => {
        await packageUpload(
          owner,
          shared,
          'Package forms.zip',
          zipSync({ 'w9.txt': strToU8('w9') }),
        );

        expect(
          await documentsIn(await childFolder(masterFolderId, 'Package forms')),
        ).toHaveLength(1);
      });

      it('refuses video in the package before issuing an upload URL', async () => {
        session.user = owner.client;

        await expect(
          unwrap(
            beginUpload({
              dealId,
              folderId: masterFolderId,
              name: 'tour.mp4',
              size: 10,
            }),
          ),
        ).rejects.toThrow(
          'tour.mp4 cannot be uploaded: video and audio files are not allowed',
        );
      });

      it('refuses a lender beginning an upload into the package', async () => {
        session.user = lender.client;

        await expect(
          unwrap(
            beginUpload({
              dealId,
              folderId: masterFolderId,
              name: 'x.pdf',
              size: 1,
            }),
          ),
        ).rejects.toThrow(NO_PACKAGE_ACCESS);
      });

      it('refuses a package upload aimed at a room folder', async () => {
        session.user = owner.client;

        await expect(
          unwrap(
            beginUpload({
              dealId,
              folderId: roomA.folderId,
              name: 'x.pdf',
              size: 1,
            }),
          ),
        ).rejects.toThrow('Files can only be added to the lender package');
      });

      it('refuses an upload that names both a room and the package', async () => {
        session.user = owner.client;

        await expect(
          unwrap(
            beginUpload({
              roomId: roomA.id,
              dealId,
              folderId: roomA.folderId,
              name: 'x.pdf',
              size: 1,
            } as Parameters<typeof beginUpload>[0]),
          ),
        ).rejects.toThrow('Add to a room or to the lender package, not both');
      });
    });

    describe('removing a file from the package', () => {
      const NOT_IN_PACKAGE = 'That file is not in the lender package';

      function remove(person: Person, target: Package, documentId: string) {
        session.user = person.client;

        return unwrap(removePackageFile({ dealId: target.dealId, documentId }));
      }

      async function removedAt(documentId: string) {
        const row = await admin
          .from('dr_document')
          .select('removed_at')
          .eq('id', documentId)
          .single()
          .throwOnError();

        return row.data.removed_at;
      }

      it('takes the file away from a lender in an open room', async () => {
        const sent = await packageUpload(
          owner,
          shared,
          'gone.pdf',
          strToU8('g'),
        );

        await remove(owner, shared, sent.ids[0]!);

        const visible = await lender.client
          .from('dr_document')
          .select('id')
          .eq('id', sent.ids[0]!)
          .throwOnError();
        expect(visible.data).toEqual([]);
      });

      it('removes every version of the file', async () => {
        const first = await packageUpload(
          owner,
          shared,
          'versions.pdf',
          strToU8('1'),
        );
        const second = await packageUpload(
          owner,
          shared,
          'versions.pdf',
          strToU8('2'),
        );

        await remove(owner, shared, second.ids[0]!);

        expect(await removedAt(first.ids[0]!)).not.toBeNull();
        expect(await removedAt(second.ids[0]!)).not.toBeNull();
      });

      it('keeps the activity already recorded against the file', async () => {
        const sent = await packageUpload(
          owner,
          shared,
          'viewed.pdf',
          strToU8('v'),
        );
        await admin
          .from('lender_room_activity')
          .insert({
            room_id: roomA.id,
            account_id: owner.accountId,
            user_id: lender.userId,
            side: 'lender',
            action: 'document_previewed',
            dr_document_id: sent.ids[0]!,
          })
          .throwOnError();

        await remove(owner, shared, sent.ids[0]!);

        const activity = await admin
          .from('lender_room_activity')
          .select('action')
          .eq('dr_document_id', sent.ids[0]!)
          .throwOnError();
        expect(activity.data).toEqual([{ action: 'document_previewed' }]);
      });

      it('refuses a lender', async () => {
        const sent = await packageUpload(
          owner,
          shared,
          'kept-1.pdf',
          strToU8('k'),
        );

        await expect(remove(lender, shared, sent.ids[0]!)).rejects.toThrow(
          NO_PACKAGE_ACCESS,
        );
        expect(await removedAt(sent.ids[0]!)).toBeNull();
      });

      it('refuses someone with no part in the deal', async () => {
        const sent = await packageUpload(
          owner,
          shared,
          'kept-2.pdf',
          strToU8('k'),
        );

        await expect(remove(stranger, shared, sent.ids[0]!)).rejects.toThrow(
          NO_PACKAGE_ACCESS,
        );
        expect(await removedAt(sent.ids[0]!)).toBeNull();
      });

      it("refuses a file in a room's own folder", async () => {
        const sent = await upload(lender, roomA, 'room-file.pdf', strToU8('r'));

        await expect(remove(owner, shared, sent.ids[0]!)).rejects.toThrow(
          NOT_IN_PACKAGE,
        );
        expect(await removedAt(sent.ids[0]!)).toBeNull();
      });

      it("refuses a file in another deal's package", async () => {
        const other = await newPackage();
        const sent = await packageUpload(
          owner,
          other,
          'elsewhere.pdf',
          strToU8('e'),
        );

        await expect(remove(owner, shared, sent.ids[0]!)).rejects.toThrow(
          NOT_IN_PACKAGE,
        );
        expect(await removedAt(sent.ids[0]!)).toBeNull();
      });
    });

    describe('package access on a team deal', () => {
      let teamPackage: Package;
      let analyst: Person;
      let otherTeamManager: Person;

      beforeAll(async () => {
        [analyst, otherTeamManager] = await Promise.all([
          provisionPerson(),
          provisionPerson(),
        ]);

        const team = await admin
          .rpc('create_team_account', {
            account_name: 'Package Team',
            user_id: owner.userId,
            account_slug: `package-team-${crypto.randomUUID().slice(0, 8)}`,
          })
          .throwOnError();
        await admin
          .rpc('create_team_account', {
            account_name: 'Other Team',
            user_id: otherTeamManager.userId,
            account_slug: `other-team-${crypto.randomUUID().slice(0, 8)}`,
          })
          .throwOnError();
        await admin
          .from('accounts_memberships')
          .insert({
            account_id: team.data.id,
            user_id: analyst.userId,
            account_role: 'analyst',
          })
          .throwOnError();

        const teamDeal = crypto.randomUUID();
        await appendDealEvent(owner.client, {
          dealId: teamDeal,
          aggregateType: 'deal',
          aggregateId: teamDeal,
          eventType: 'deal.created',
          payload: {
            account_id: team.data.id,
            owner_user_id: owner.userId,
            firm_id: null,
            description: 'Team package deal',
            source: 'manual',
            stage: 'sourcing',
          },
        });
        const master = await admin
          .from('dr_folder')
          .insert({
            account_id: team.data.id,
            deal_id: teamDeal,
            name: 'Lender package',
          })
          .select('id')
          .single()
          .throwOnError();
        await admin
          .from('lender_package')
          .insert({
            deal_id: teamDeal,
            account_id: team.data.id,
            master_folder_id: master.data.id,
          })
          .throwOnError();

        teamPackage = { dealId: teamDeal, masterFolderId: master.data.id };
      }, 60_000);

      afterAll(async () => {
        await Promise.all(
          [analyst, otherTeamManager].map((person) =>
            admin.auth.admin.deleteUser(person.userId),
          ),
        );
      });

      it('lets the team manager add to the package', async () => {
        const id = await packageFolder(owner, teamPackage, 'Team folder');

        expect(
          await foldersNamed(teamPackage.masterFolderId, 'Team folder'),
        ).toEqual([id]);
      });

      it('refuses a team member who cannot manage deals', async () => {
        await expect(
          packageFolder(analyst, teamPackage, 'Analyst folder'),
        ).rejects.toThrow(NO_PACKAGE_ACCESS);
      });

      it('refuses a manager of a different team', async () => {
        await expect(
          packageFolder(otherTeamManager, teamPackage, 'Other team folder'),
        ).rejects.toThrow(NO_PACKAGE_ACCESS);
      });

      it('refuses a deal id that does not exist', async () => {
        await expect(
          packageFolder(
            owner,
            { dealId: crypto.randomUUID(), masterFolderId },
            'Nowhere',
          ),
        ).rejects.toThrow(NO_PACKAGE_ACCESS);
      });
    });

    describe('a package holding 5,000 folders', () => {
      let full: Package;
      let lastFolderId: string;

      beforeAll(async () => {
        full = await newPackage();

        for (let start = 0; start < 4999; start += 1000) {
          await admin
            .from('dr_folder')
            .insert(
              Array.from(
                { length: Math.min(1000, 4999 - start) },
                (_, index) => ({
                  account_id: owner.accountId,
                  deal_id: full.dealId,
                  parent_id: full.masterFolderId,
                  name: `filler ${start + index}`,
                }),
              ),
            )
            .throwOnError();
        }

        lastFolderId = await packageFolder(owner, full, 'Last one');
      }, 120_000);

      afterAll(async () => {
        await admin
          .from('dr_folder')
          .delete()
          .eq('parent_id', full.masterFolderId)
          .throwOnError();
      });

      it('makes the 5,000th folder', async () => {
        expect(await foldersNamed(full.masterFolderId, 'Last one')).toEqual([
          lastFolderId,
        ]);
      });

      it('refuses one more', async () => {
        await expect(packageFolder(owner, full, 'One more')).rejects.toThrow(
          'The lender package has reached its limit of 5,000 folders',
        );
      });

      it('keeps a zip as one file when expanding it into the package would pass 5,000', async () => {
        await packageUpload(
          owner,
          full,
          'Spill.zip',
          zipSync({ 'a.txt': strToU8('a') }),
        );

        expect(
          await documentsNamed(full.masterFolderId, 'Spill.zip'),
        ).toHaveLength(1);
        expect(await foldersNamed(full.masterFolderId, 'Spill')).toEqual([]);
      });

      it('refuses a dropped tree that would pass 5,000', async () => {
        await expect(packageTree(owner, full, 'Overflow', [])).rejects.toThrow(
          'The lender package has reached its limit of 5,000 folders',
        );
      });
    });
  },
);

describe('a room with more than 1,000 folders', { timeout: 120_000 }, () => {
  let crowded: Room;
  let leftOutOfCappedListing: string;

  beforeAll(async () => {
    crowded = await newRoom('Crowded Bank');
    await addMember(crowded, lender);

    const folders = await admin
      .from('dr_folder')
      .insert(
        Array.from({ length: 1100 }, (_, index) => ({
          account_id: owner.accountId,
          deal_id: dealId,
          parent_id: crowded.folderId,
          name: `folder ${index}`,
        })),
      )
      .select('id')
      .throwOnError();
    const capped = await admin
      .from('dr_folder')
      .select('id, parent_id')
      .eq('deal_id', dealId)
      .throwOnError();
    const listed = new Set(capped.data.map((folder) => folder.id));

    leftOutOfCappedListing = folders.data.find(
      (folder) => !listed.has(folder.id),
    )!.id;
  }, 120_000);

  afterAll(async () => {
    await admin
      .from('dr_folder')
      .delete()
      .eq('parent_id', crowded.folderId)
      .throwOnError();
  });

  it('accepts an upload into a folder that a capped listing of the deal leaves out', async () => {
    await upload(
      lender,
      crowded,
      'late.pdf',
      strToU8('late'),
      leftOutOfCappedListing,
    );

    expect(
      await documentsNamed(leftOutOfCappedListing, 'late.pdf'),
    ).toHaveLength(1);
  });

  it('still refuses a folder outside the room', async () => {
    await expect(
      begin(lender, crowded, 'x.pdf', 1, masterFolderId),
    ).rejects.toThrow(WRONG_FOLDER);
  });

  it('still numbers a colliding expanded folder', async () => {
    await newFolder('Crowded', crowded.folderId);

    await upload(
      lender,
      crowded,
      'Crowded.zip',
      zipSync({ 'a.txt': strToU8('a') }),
    );

    expect(
      await documentsIn(await childFolder(crowded.folderId, 'Crowded (2)')),
    ).toHaveLength(1);
  });
});
