import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

import { z } from 'zod';

import { fetchDocuments, fetchFolders } from '@odb/data-room';
import type { Database } from '@odb/supabase';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

import {
  buildRoomListing,
  lenderView,
  type MarkedRoomListing,
  type RoomListing,
} from './listing';

export type LoadedRoomListing =
  | ({ viewer: 'lender' } & RoomListing)
  | ({ viewer: 'deal_team' } & MarkedRoomListing);

const roomRootsSchema = z.object({
  deal_id: z.string(),
  master_folder_id: z.string().nullable(),
  private_folder_id: z.string().nullable(),
});

export async function loadRoomListing(
  client: SupabaseClient<Database>,
  input: { roomId: string; since: string | null },
): Promise<LoadedRoomListing> {
  const { data: roomSummary } = await client
    .rpc('lender_room_view', { room_id: input.roomId })
    .single()
    .throwOnError();
  const roots = roomRootsSchema.parse(roomSummary);
  const userResult = await client.auth.getUser();

  // The room summary above only answers a member or the deal team, so this
  // room's hides and the caller's own uploads, which lenders cannot read, are
  // read with the service role. A lender in two rooms can read a file this
  // room hides, so the hides are applied here and not left to row security.
  const serviceRole = getSupabaseServerAdminClient();

  const [folders, documents, oversize, hidden, ownUploads, isDealTeam] =
    await Promise.all([
      fetchFolders(client, roots.deal_id),
      fetchDocuments(client, roots.deal_id),
      client.from('lender_oversize_file').select('*').throwOnError(),
      serviceRole
        .from('lender_room_hidden')
        .select('*')
        .eq('room_id', input.roomId)
        .throwOnError(),
      serviceRole
        .from('lender_upload')
        .select('document_ids')
        .eq('room_id', input.roomId)
        .eq('uploaded_by', z.string().parse(userResult.data.user?.id))
        .throwOnError(),
      client
        .rpc('can_manage_lender_room', { room_id: input.roomId })
        .throwOnError(),
    ]);

  const listing = buildRoomListing({
    roots,
    folders,
    documents,
    oversize: oversize.data,
    hidden: hidden.data,
    ownUploadIds: ownUploads.data.flatMap(
      (upload) => upload.document_ids ?? [],
    ),
    since: input.since,
  });

  return isDealTeam.data
    ? { viewer: 'deal_team', ...listing }
    : { viewer: 'lender', ...lenderView(listing) };
}
