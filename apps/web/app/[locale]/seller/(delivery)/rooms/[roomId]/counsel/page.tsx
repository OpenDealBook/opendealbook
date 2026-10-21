import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { z } from 'zod';

import { isSignedIn } from '@odb/lender-rooms/members/room-gate.ts';
import { audienceNote } from '@odb/seller-rooms/counsel-thread/audience.ts';
import {
  loadSellerCounselThread,
  loadSellerSide,
} from '@odb/seller-rooms/counsel-thread/queries.ts';
import {
  sellerRoomPath,
  sellerSignInPath,
} from '@odb/seller-rooms/members/entry-rules.ts';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { SellerCounselThread } from './seller-counsel-thread';

export default async function SellerCounselThreadPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;

  if (!z.uuid().safeParse(roomId).success) {
    notFound();
  }

  const client = getSupabaseServerClient();
  const path = `${sellerRoomPath(roomId)}/counsel`;

  if (!(await isSignedIn(client))) {
    redirect(sellerSignInPath(path));
  }

  const { data: room } = await client
    .rpc('my_seller_rooms')
    .eq('id', roomId)
    .maybeSingle()
    .throwOnError();

  if (!room) {
    notFound();
  }

  const { data: isSeller } = await client
    .rpc('is_deal_seller_room_member', { deal_id: room.deal_id })
    .throwOnError();

  if (!isSeller) {
    notFound();
  }

  // Service role: the seller cannot read counsel or fellow sellers by
  // themselves. is_deal_seller_room_member proved they are the seller here.
  const [
    {
      data: { user },
    },
    messages,
    side,
    { data: readOnlyReason },
  ] = await Promise.all([
    client.auth.getUser(),
    loadSellerCounselThread(client, room.deal_id),
    loadSellerSide(getSupabaseServerAdminClient(), room.deal_id),
    client
      .rpc('seller_side_read_only_reason', { deal_id: room.deal_id })
      .throwOnError(),
  ]);

  return (
    <main className={'flex max-w-3xl flex-col gap-6'}>
      <Link className={'text-sm underline'} href={sellerRoomPath(roomId)}>
        Back to the room
      </Link>
      <h1 className={'text-2xl font-semibold'}>Messages with your counsel</h1>
      {side.counsel.length === 0 ? (
        <p className={'text-muted-foreground'}>
          Invite your counsel from the room page to start a private thread with
          them.
        </p>
      ) : (
        <SellerCounselThread
          dealId={room.deal_id}
          readOnlyReason={readOnlyReason}
          messages={messages}
          audience={audienceNote(user!.id, side)}
          filesPath={`${path}/files`}
        />
      )}
    </main>
  );
}
