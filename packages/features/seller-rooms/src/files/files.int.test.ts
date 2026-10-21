import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  ANON_KEY,
  SERVICE_ROLE_KEY,
  SUPABASE_URL,
  admin,
  cleanUp,
  newDeal,
  provisionPerson,
  provisionTeam,
  type Person,
} from '../test-support/world';

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL);
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', ANON_KEY);
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', SERVICE_ROLE_KEY);

import { respondToSellerDocumentRequest } from './document-access';
import { loadSellerRoomListing, recordSellerRoomVisit } from './listing';
import { respondToSellerZipRequest } from './zip-download';

let owner: Person;
let seller: Person;
let outsider: Person;
let teamId: string;
let dealId: string;
let roomId: string;
let uploadsFolder: string;
let financials: string;
let year: string;
let pnl: string;
let lease: string;
let internalNote: string;
const storedPaths: string[] = [];

async function folder(name: string, parentId: string | null = null) {
  const { data } = await admin
    .from('dr_folder')
    .insert({ account_id: teamId, deal_id: dealId, parent_id: parentId, name })
    .select('id')
    .single()
    .throwOnError();

  return data.id;
}

async function documentIn(
  folderId: string,
  name: string,
  version = 1,
  id = crypto.randomUUID(),
) {
  const storagePath = `deal/${dealId}/${crypto.randomUUID()}`;
  await admin.storage
    .from('data-room')
    .upload(storagePath, new Blob([`bytes of ${name}`]));
  storedPaths.push(storagePath);

  await admin
    .rpc('append_deal_event', {
      p_deal_id: dealId,
      p_aggregate_type: 'dr_document',
      p_aggregate_id: id,
      p_event_type: 'dr_document.added',
      p_payload: {
        folder_id: folderId,
        name,
        storage_path: storagePath,
        version,
      },
      p_actor_kind: 'service',
    })
    .throwOnError();

  return id;
}

async function activity() {
  const { data } = await admin
    .from('seller_room_activity')
    .select('user_id, side, action, dr_document_id, dr_folder_id')
    .eq('room_id', roomId)
    .order('created_at')
    .throwOnError();

  return data;
}

function fileRequest(documentId: string, disposition: string) {
  return new Request(
    `http://localhost:3000/seller/rooms/${roomId}/files/${documentId}?disposition=${disposition}`,
  );
}

beforeAll(async () => {
  owner = await provisionPerson();
  seller = await provisionPerson();
  outsider = await provisionPerson();
  teamId = await provisionTeam(owner, 'Acme Partners');
  dealId = await newDeal(teamId, owner);

  const { data } = await owner.client
    .rpc('ensure_seller_room', { deal_id: dealId })
    .throwOnError();
  roomId = data;

  const { data: room } = await admin
    .from('seller_room')
    .select('uploads_folder_id')
    .eq('id', roomId)
    .single()
    .throwOnError();
  uploadsFolder = room.uploads_folder_id;

  financials = await folder('Financials');
  year = await folder('2024', financials);
  const internal = await folder('Internal');

  await documentIn(year, 'p-and-l.pdf', 1);
  pnl = await documentIn(year, 'p-and-l.pdf', 2);
  internalNote = await documentIn(internal, 'notes.pdf');
  lease = await documentIn(uploadsFolder, 'lease.pdf');

  await admin
    .from('seller_room_folder')
    .insert({ room_id: roomId, dr_folder_id: financials })
    .throwOnError();
  await admin
    .from('seller_room_member')
    .insert({
      room_id: roomId,
      user_id: seller.userId,
      email: seller.email,
      name: 'Sam Seller',
    })
    .throwOnError();
});

afterAll(async () => {
  await admin.storage.from('data-room').remove(storedPaths);
  await cleanUp([teamId]);
});

describe('seller room listing', () => {
  it('lists the picked folders under the team side and the uploads as the seller side, with the latest version of each file', async () => {
    const listing = await loadSellerRoomListing(seller.client, roomId);

    expect(listing.master!.folders.map((folder) => folder.id)).toEqual([
      financials,
    ]);
    expect(
      listing.master!.folders[0]!.folders.map((folder) => folder.name),
    ).toEqual(['2024']);
    expect(listing.master!.folders[0]!.folders[0]!.entries).toEqual([
      expect.objectContaining({
        documentId: pnl,
        name: 'p-and-l.pdf',
        version: 2,
        earlierVersions: [expect.objectContaining({ version: 1 })],
      }),
    ]);
    expect(listing.private!.id).toBe(uploadsFolder);
    expect(listing.private!.entries.map((entry) => entry.name)).toEqual([
      'lease.pdf',
    ]);
  });

  it('marks files added since the seller last opened the room as new', async () => {
    await admin
      .from('seller_room_activity')
      .insert({
        room_id: roomId,
        account_id: teamId,
        user_id: seller.userId,
        side: 'seller',
        action: 'room_opened',
        created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      })
      .throwOnError();
    const recent = await documentIn(financials, 'new-memo.pdf');

    const listing = await loadSellerRoomListing(seller.client, roomId);
    const entry = listing.master!.folders[0]!.entries.find(
      (candidate) =>
        candidate.kind === 'file' && candidate.documentId === recent,
    );

    expect(entry).toEqual(expect.objectContaining({ visitMark: 'new' }));
  });

  it('records the seller opening the room and a folder', async () => {
    await recordSellerRoomVisit(seller.client, admin, roomId, null);
    await recordSellerRoomVisit(seller.client, admin, roomId, year);

    expect(await activity()).toEqual(
      expect.arrayContaining([
        {
          user_id: seller.userId,
          side: 'seller',
          action: 'room_opened',
          dr_document_id: null,
          dr_folder_id: null,
        },
        {
          user_id: seller.userId,
          side: 'seller',
          action: 'folder_opened',
          dr_document_id: null,
          dr_folder_id: year,
        },
      ]),
    );
  });
});

describe('seller document requests', () => {
  it('sends the seller to the file and records the preview and the download', async () => {
    const preview = await respondToSellerDocumentRequest({
      client: seller.client,
      admin,
      request: fileRequest(pnl, 'preview'),
      roomId,
      documentId: pnl,
    });
    const download = await respondToSellerDocumentRequest({
      client: seller.client,
      admin,
      request: fileRequest(pnl, 'download'),
      roomId,
      documentId: pnl,
    });

    expect(preview.status).toBe(307);
    expect(preview.headers.get('location')).toContain(
      '/storage/v1/object/sign/data-room/',
    );
    expect(download.status).toBe(307);
    expect(await activity()).toEqual(
      expect.arrayContaining([
        {
          user_id: seller.userId,
          side: 'seller',
          action: 'document_previewed',
          dr_document_id: pnl,
          dr_folder_id: null,
        },
        {
          user_id: seller.userId,
          side: 'seller',
          action: 'document_downloaded',
          dr_document_id: pnl,
          dr_folder_id: null,
        },
      ]),
    );
  });

  it('answers 404 for a file the room does not show, and records nothing', async () => {
    const before = (await activity()).length;

    const response = await respondToSellerDocumentRequest({
      client: seller.client,
      admin,
      request: fileRequest(internalNote, 'preview'),
      roomId,
      documentId: internalNote,
    });

    expect(response.status).toBe(404);
    expect(await activity()).toHaveLength(before);
  });

  it('answers 404 to someone who is not in the room', async () => {
    const response = await respondToSellerDocumentRequest({
      client: outsider.client,
      admin,
      request: fileRequest(pnl, 'preview'),
      roomId,
      documentId: pnl,
    });

    expect(response.status).toBe(404);
  });

  it('sends someone signed out to seller sign-in, back to the room', async () => {
    const signedOut = (await import('@supabase/supabase-js')).createClient(
      SUPABASE_URL,
      ANON_KEY,
      {
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );

    const response = await respondToSellerDocumentRequest({
      client: signedOut,
      admin,
      request: fileRequest(pnl, 'preview'),
      roomId,
      documentId: pnl,
    });

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      `http://localhost:3000/seller/sign-in?next=${encodeURIComponent(`/seller/rooms/${roomId}`)}`,
    );
  });

  it('sends a request from another site back to the room without recording it', async () => {
    const before = (await activity()).length;
    const request = new Request(
      `http://localhost:3000/seller/rooms/${roomId}/files/${pnl}?disposition=preview`,
      { headers: { 'sec-fetch-site': 'cross-site' } },
    );

    const response = await respondToSellerDocumentRequest({
      client: seller.client,
      admin,
      request,
      roomId,
      documentId: pnl,
    });

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      `http://localhost:3000/seller/rooms/${roomId}`,
    );
    expect(await activity()).toHaveLength(before);
  });
});

function zipRequest(documentIds: string[], origin = 'http://localhost:3000') {
  const form = new FormData();

  for (const id of documentIds) {
    form.append('documentIds', id);
  }

  return new Request(`http://localhost:3000/seller/rooms/${roomId}/files/zip`, {
    method: 'POST',
    headers: { host: 'localhost:3000', origin },
    body: form,
  });
}

describe('seller zip downloads', () => {
  it('zips the chosen files under their room folders and records the download', async () => {
    const response = await respondToSellerZipRequest({
      client: seller.client,
      admin,
      request: zipRequest([pnl, lease]),
      roomId,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/zip');

    const { unzipSync, strFromU8 } = await import('fflate');
    const files = unzipSync(new Uint8Array(await response.arrayBuffer()));

    expect(Object.keys(files).sort()).toEqual([
      'Financials/2024/p-and-l.pdf',
      'Uploads/lease.pdf',
    ]);
    expect(strFromU8(files['Uploads/lease.pdf']!)).toBe('bytes of lease.pdf');
    expect(await activity()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          user_id: seller.userId,
          side: 'seller',
          action: 'zip_downloaded',
        }),
      ]),
    );
  });

  it('refuses the whole zip when any file is not shown in the room', async () => {
    const response = await respondToSellerZipRequest({
      client: seller.client,
      admin,
      request: zipRequest([pnl, internalNote]),
      roomId,
    });

    expect(response.status).toBe(404);
  });

  it('refuses a zip asked for from another site', async () => {
    const response = await respondToSellerZipRequest({
      client: seller.client,
      admin,
      request: zipRequest([pnl], 'https://evil.test'),
      roomId,
    });

    expect(response.status).toBe(403);
  });

  it('refuses someone who is not in the room', async () => {
    const response = await respondToSellerZipRequest({
      client: outsider.client,
      admin,
      request: zipRequest([pnl]),
      roomId,
    });

    expect(response.status).toBe(404);
  });
});
