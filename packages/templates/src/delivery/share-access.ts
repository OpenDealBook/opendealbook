import type { SupabaseClient } from '@supabase/supabase-js';

import { z } from 'zod';

import { signedInUser } from '@odb/lender-rooms/activity/signed-in-user.ts';
import {
  sellerRoomPath,
  sellerSignInPath,
} from '@odb/seller-rooms/members/entry-rules.ts';
import type { Database } from '@odb/supabase';

import { GENERATED_BUCKET, SIGNED_URL_SECONDS } from '../storage';

type Client = SupabaseClient<Database>;

export async function respondToSellerShareRequest({
  client,
  admin,
  request,
  roomId,
  shareId,
}: {
  client: Client;
  admin: Client;
  request: Request;
  roomId: string;
  shareId: string;
}): Promise<Response> {
  if (
    !z.uuid().safeParse(roomId).success ||
    !z.uuid().safeParse(shareId).success
  ) {
    return new Response(null, { status: 400 });
  }

  if (request.headers.get('sec-fetch-site') === 'cross-site') {
    return Response.redirect(new URL(sellerRoomPath(roomId), request.url), 307);
  }

  const user = await signedInUser(client);

  if (!user) {
    return Response.redirect(
      new URL(sellerSignInPath(sellerRoomPath(roomId)), request.url),
      307,
    );
  }

  const [{ data: member }, { data: share }] = await Promise.all([
    client.rpc('is_seller_room_member', { room_id: roomId }).throwOnError(),
    admin
      .from('document_share')
      .select(
        'room_id, account_id, recipient_user_id, first_viewed_at, generated_document(pdf_path)',
      )
      .eq('id', shareId)
      .maybeSingle()
      .throwOnError(),
  ]);

  if (!member || share?.room_id !== roomId) {
    return new Response(null, { status: 404 });
  }

  const { data: signed, error } = await admin.storage
    .from(GENERATED_BUCKET)
    .createSignedUrl(share.generated_document.pdf_path!, SIGNED_URL_SECONDS);

  if (error) {
    throw error;
  }

  if (share.recipient_user_id === user.id && !share.first_viewed_at) {
    await admin
      .from('document_share')
      .update({ first_viewed_at: new Date().toISOString() })
      .eq('id', shareId)
      .is('first_viewed_at', null)
      .throwOnError();
  }

  await admin
    .from('seller_room_activity')
    .insert({
      room_id: roomId,
      account_id: share.account_id,
      user_id: user.id,
      side: 'seller',
      action: 'document_previewed',
      payload: { share_id: shareId },
    })
    .throwOnError();

  return Response.redirect(signed.signedUrl, 307);
}
