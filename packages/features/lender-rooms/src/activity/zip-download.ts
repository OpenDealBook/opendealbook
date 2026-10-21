import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

import { z } from 'zod';

import {
  readZipRequest,
  zipEntryPaths,
  zipResponse,
} from '@odb/data-room/room-zip';
import { isOwnDealStoragePath } from '@odb/data-room/storage-path';
import type { Database } from '@odb/supabase';

import { storedSize } from '../uploads/objects';
import { recordActivity } from './record-activity';
import { signedInUser } from './signed-in-user';

type Client = SupabaseClient<Database>;

interface ZipDownloadInput {
  client: Client;
  admin: Client;
  roomId: string;
  documentIds: string[];
}

async function recordZipDownload({
  client,
  admin,
  roomId,
  documentIds,
}: ZipDownloadInput): Promise<Response | null> {
  const shown = await Promise.all(
    documentIds.map(async (documentId) => {
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
      .in('id', documentIds)
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

  const entries = zipEntryPaths({
    documentIds,
    documents,
    folders,
    roots: [room.private_folder_id, room.master_folder_id],
  });

  await recordActivity({
    client,
    admin,
    roomId,
    action: 'zip_downloaded',
    payload: { document_ids: documentIds },
  });

  return zipResponse(admin, entries, room.name!);
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
  const read = await readZipRequest(request);

  if (read instanceof Response) {
    return read;
  }

  if (!z.uuid().safeParse(roomId).success) {
    return new Response(null, { status: 400 });
  }

  if (!(await signedInUser(client))) {
    return new Response(null, { status: 401 });
  }

  const zip = await recordZipDownload({
    client,
    admin,
    roomId,
    documentIds: read.documentIds,
  });

  return zip ?? new Response(null, { status: 404 });
}
