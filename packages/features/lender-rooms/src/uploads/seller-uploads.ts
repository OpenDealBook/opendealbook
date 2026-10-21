import 'server-only';
import { z } from 'zod';

import { dataRoomDocumentPath } from '@odb/notifications/relay';
import { getSupabaseServerClient } from '@odb/supabase/server';

import {
  notifyDealManagers,
  queueSellerActivity,
} from '../actions/deal-managers';
import type { Space } from './access';
import type { Admin } from './objects';

type Uploader =
  | { kind: 'team' }
  | { kind: 'seller'; name: string }
  | { kind: 'seller-counsel'; counsel: string; seller: string };

async function uploaderIn(
  admin: Admin,
  space: Space,
  userId: string,
): Promise<Uploader> {
  const roomId = space.sellerRoomId!;
  const [{ data: seller }, { data: counsel }] = await Promise.all([
    admin
      .from('seller_room_member')
      .select('name')
      .eq('room_id', roomId)
      .eq('user_id', userId)
      .maybeSingle()
      .throwOnError(),
    admin
      .from('deal_counsel')
      .select('name, email, invited_by')
      .eq('deal_id', space.deal_id)
      .eq('side', 'seller')
      .eq('user_id', userId)
      .maybeSingle()
      .throwOnError(),
  ]);

  if (seller) {
    return { kind: 'seller', name: seller.name };
  }

  if (!counsel) {
    return { kind: 'team' };
  }

  const { data: client } = await admin
    .from('seller_room_member')
    .select('name')
    .eq('room_id', roomId)
    .eq('user_id', counsel.invited_by!)
    .maybeSingle()
    .throwOnError();

  return {
    kind: 'seller-counsel',
    counsel: counsel.name ?? counsel.email,
    seller: client?.name ?? 'the seller',
  };
}

function uploadLine(uploader: Uploader, fileName: string): string | null {
  switch (uploader.kind) {
    case 'team':
      return null;
    case 'seller':
      return `${uploader.name} uploaded ${fileName}`;
    case 'seller-counsel':
      return `Uploaded by ${uploader.counsel} for ${uploader.seller}: ${fileName}`;
  }
}

export async function recordSellerUpload(
  admin: Admin,
  space: Space,
  userId: string,
  fileName: string,
  documentIds: string[],
): Promise<void> {
  const roomId = space.sellerRoomId!;
  const uploader = await uploaderIn(admin, space, userId);

  await admin
    .from('seller_room_activity')
    .insert(
      documentIds.map((documentId) => ({
        room_id: roomId,
        account_id: space.account_id,
        user_id: userId,
        side:
          uploader.kind === 'team' ? ('internal' as const) : ('seller' as const),
        action: 'document_uploaded' as const,
        dr_document_id: documentId,
      })),
    )
    .throwOnError();

  const line = uploadLine(uploader, fileName);

  if (line !== null) {
    const { data: team } = await admin
      .from('accounts')
      .select('slug')
      .eq('id', space.account_id)
      .single()
      .throwOnError();

    await notifyDealManagers(
      admin,
      space.account_id,
      space.deal_id,
      line,
      dataRoomDocumentPath(
        z.string().parse(team.slug),
        space.deal_id,
        documentIds[0]!,
      ),
    );
    await queueSellerActivity(admin, space.account_id, { roomId, line });
  }
}

export async function recordSellerFolderCreated(
  admin: Admin,
  space: Space,
  folderId: string,
): Promise<void> {
  const { data } = await getSupabaseServerClient().auth.getUser();
  const userId = data.user!.id;
  const uploader = await uploaderIn(admin, space, userId);

  await admin
    .from('seller_room_activity')
    .insert({
      room_id: space.sellerRoomId!,
      account_id: space.account_id,
      user_id: userId,
      side: uploader.kind === 'team' ? 'internal' : 'seller',
      action: 'folder_created',
      dr_folder_id: folderId,
    })
    .throwOnError();
}
