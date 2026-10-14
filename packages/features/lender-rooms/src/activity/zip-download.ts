import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { Zip, ZipPassThrough } from 'fflate';
import { z } from 'zod';

import { downloadFromDataRoom } from '@odb/data-room/storage';
import type { Database } from '@odb/supabase';

import { storedSize } from '../uploads/objects';
import { recordActivity } from './record-activity';
import { signedInUser } from './signed-in-user';
import { isOwnDealStoragePath } from './storage-path';

type Client = SupabaseClient<Database>;

type Folder = Pick<
  Database['public']['Tables']['dr_folder']['Row'],
  'id' | 'parent_id' | 'name'
>;

const FORM_CONTENT_TYPE =
  /^(multipart\/form-data|application\/x-www-form-urlencoded)/i;

const documentIdsSchema = z.array(z.uuid()).min(1);

interface ZipDownloadInput {
  client: Client;
  admin: Client;
  roomId: string;
  documentIds: string[];
}

interface RoomZip {
  roomName: string;
  stream: ReadableStream<Uint8Array>;
}

async function recordZipDownload({
  client,
  admin,
  roomId,
  documentIds,
}: ZipDownloadInput): Promise<RoomZip | null> {
  const uniqueIds = [...new Set(documentIds)];

  const shown = await Promise.all(
    uniqueIds.map(async (documentId) => {
      const { data } = await client
        .rpc('lender_room_shows_document', {
          room_id: roomId,
          document_id: documentId,
        })
        .throwOnError();

      return data;
    }),
  );

  if (shown.includes(false)) {
    return null;
  }

  const { data: room } = await client
    .rpc('lender_room_view', { room_id: roomId })
    .single()
    .throwOnError();

  const [{ data: documents }, { data: folders }] = await Promise.all([
    admin
      .from('dr_document')
      .select('id, deal_id, folder_id, name, storage_path')
      .in('id', uniqueIds)
      .throwOnError(),
    admin
      .from('dr_folder')
      .select('id, parent_id, name')
      .eq('deal_id', room.deal_id!)
      .throwOnError(),
  ]);

  if (!documents.every(isOwnDealStoragePath)) {
    return null;
  }

  const sizes = await Promise.all(
    documents.map((document) => storedSize(admin, document.storage_path)),
  );

  if (sizes.includes(null)) {
    return null;
  }

  const foldersById = new Map(folders.map((folder) => [folder.id, folder]));
  const roots = [room.private_folder_id, room.master_folder_id];
  const entriesPerPath = new Map<string, number>();

  const entries = uniqueIds.map((documentId) => {
    const document = documents.find(({ id }) => id === documentId)!;
    const path = entryPath([
      ...folderNames(foldersById, roots, document.folder_id),
      document.name,
    ]);
    const copyNumber = (entriesPerPath.get(path) ?? 0) + 1;

    entriesPerPath.set(path, copyNumber);

    return {
      storagePath: document.storage_path,
      path: copyNumber === 1 ? path : withCopyNumber(path, copyNumber),
    };
  });

  await recordActivity({
    client,
    admin,
    roomId,
    action: 'zip_downloaded',
    payload: { document_ids: uniqueIds },
  });

  const zip = new Zip();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      zip.ondata = (error, chunk, final) => {
        if (error) {
          controller.error(error);
          return;
        }

        controller.enqueue(chunk);

        if (final) {
          controller.close();
        }
      };
    },
    async pull() {
      const entry = entries.shift();

      if (!entry) {
        zip.end();
        return;
      }

      const file = new ZipPassThrough(entry.path);
      const blob = await downloadFromDataRoom(admin, entry.storagePath);

      zip.add(file);
      file.push(new Uint8Array(await blob.arrayBuffer()), true);
    },
  });

  return { roomName: room.name!, stream };
}

function folderNames(
  folders: Map<string, Folder>,
  roots: (string | null)[],
  folderId: string,
): string[] {
  const folder = folders.get(folderId)!;

  return roots.includes(folder.id)
    ? [folder.name]
    : [...folderNames(folders, roots, folder.parent_id!), folder.name];
}

function entryPath(names: string[]): string {
  return names
    .map((name) => name.replace(/[/\\]/g, '_'))
    .filter((name) => name !== '' && name !== '.' && name !== '..')
    .join('/');
}

function withCopyNumber(path: string, copyNumber: number): string {
  return path.replace(/(\.[^./]+)?$/, ` (${copyNumber})$1`);
}

interface ZipRequestInput {
  client: Client;
  admin: Client;
  request: Request;
  roomId: string;
}

export async function respondToZipRequest({
  client,
  admin,
  request,
  roomId,
}: ZipRequestInput): Promise<Response> {
  const ownHost =
    request.headers.get('x-forwarded-host') ?? request.headers.get('host');

  if (URL.parse(String(request.headers.get('origin')))?.host !== ownHost) {
    return new Response(null, { status: 403 });
  }

  if (!FORM_CONTENT_TYPE.test(String(request.headers.get('content-type')))) {
    return new Response(null, { status: 400 });
  }

  const documentIds = documentIdsSchema.safeParse(
    (await request.formData()).getAll('documentIds'),
  );

  if (!documentIds.success || !z.uuid().safeParse(roomId).success) {
    return new Response(null, { status: 400 });
  }

  if (!(await signedInUser(client))) {
    return new Response(null, { status: 401 });
  }

  const zip = await recordZipDownload({
    client,
    admin,
    roomId,
    documentIds: documentIds.data,
  });

  if (!zip) {
    return new Response(null, { status: 404 });
  }

  return new Response(zip.stream, {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`${zip.roomName}.zip`)}`,
    },
  });
}
