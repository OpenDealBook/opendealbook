import type { SupabaseClient } from '@supabase/supabase-js';

import { z } from 'zod';

import {
  dispositionSchema,
  signedDocumentUrl,
} from '@odb/lender-rooms/activity/signed-document-url.ts';
import { signedInUser } from '@odb/lender-rooms/activity/signed-in-user.ts';
import type { Database } from '@odb/supabase';

import { sellerRoomPath, sellerSignInPath } from '../members/entry-rules';

type Client = SupabaseClient<Database>;

const requestSchema = z.object({
  roomId: z.uuid(),
  documentId: z.uuid(),
  disposition: dispositionSchema,
});

export async function respondToSellerDocumentRequest({
  client,
  admin,
  request,
  roomId,
  documentId,
}: {
  client: Client;
  admin: Client;
  request: Request;
  roomId: string;
  documentId: string;
}): Promise<Response> {
  const parsed = requestSchema.safeParse({
    roomId,
    documentId,
    disposition: new URL(request.url).searchParams.get('disposition'),
  });

  if (!parsed.success) {
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

  const [{ data: room }, { data: document }] = await Promise.all([
    client
      .from('seller_room')
      .select('account_id, deal_id')
      .eq('id', roomId)
      .maybeSingle()
      .throwOnError(),
    client
      .from('dr_document')
      .select('name, deal_id, storage_path')
      .eq('id', documentId)
      .maybeSingle()
      .throwOnError(),
  ]);

  const { data: member } = await client.rpc('is_seller_room_member', {
    room_id: roomId,
  });

  if (!room || !document || !member || document.deal_id !== room.deal_id) {
    return new Response(null, { status: 404 });
  }

  const url = await signedDocumentUrl(admin, document, parsed.data.disposition);

  if (!url) {
    return new Response(null, { status: 404 });
  }

  await admin
    .from('seller_room_activity')
    .insert({
      room_id: roomId,
      account_id: room.account_id,
      user_id: user.id,
      side: 'seller',
      action:
        parsed.data.disposition === 'preview'
          ? 'document_previewed'
          : 'document_downloaded',
      dr_document_id: documentId,
    })
    .throwOnError();

  return Response.redirect(url, 307);
}
