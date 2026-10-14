import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Json } from '@odb/supabase';

import { Refusal } from '../actions/refusal';

type Client = SupabaseClient<Database>;

interface RecordActivityInput {
  client: Client;
  admin: Client;
  roomId: string;
  action: Database['public']['Enums']['lender_activity_action'];
  documentId?: string;
  folderId?: string;
  payload?: Json;
}

export async function recordActivity(input: RecordActivityInput): Promise<void> {
  const side = await callerSide(input.client, input.roomId);
  // Lenders have no write path, and no document or storage read outside this
  // gate, so a verified member's write and the file reads use the service role.
  const writer = side === 'internal' ? input.client : input.admin;

  const {
    data: { user },
  } = await input.client.auth.getUser();

  const { data: room } = await writer
    .from('lender_room')
    .select('account_id')
    .eq('id', input.roomId)
    .single()
    .throwOnError();

  await writer
    .from('lender_room_activity')
    .insert({
      room_id: input.roomId,
      account_id: room.account_id,
      user_id: user!.id,
      side,
      action: input.action,
      dr_document_id: input.documentId,
      dr_folder_id: input.folderId,
      payload: input.payload,
    })
    .throwOnError();
}

async function callerSide(
  client: Client,
  roomId: string,
): Promise<Database['public']['Enums']['lender_side']> {
  const { data: manages } = await client
    .rpc('can_manage_lender_room', { room_id: roomId })
    .throwOnError();

  if (manages) {
    return 'internal';
  }

  const { data: member } = await client
    .rpc('is_lender_room_member', { room_id: roomId })
    .throwOnError();

  if (member) {
    return 'lender';
  }

  throw new Refusal('Caller has no access to this lender room');
}

interface RecordFolderActivityInput {
  client: Client;
  admin: Client;
  roomId: string;
  folderId: string;
}

export async function recordFolderActivity({
  client,
  admin,
  roomId,
  folderId,
}: RecordFolderActivityInput): Promise<void> {
  const { data: shown } = await client
    .rpc('lender_room_shows_folder', { room_id: roomId, folder_id: folderId })
    .throwOnError();

  if (!shown) {
    throw new Refusal('Folder is not shown in this lender room');
  }

  await recordActivity({
    client,
    admin,
    roomId,
    folderId,
    action: 'folder_opened',
  });
}
