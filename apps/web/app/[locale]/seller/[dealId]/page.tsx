import { redirect } from 'next/navigation';

import { isSignedIn } from '@odb/lender-rooms/members/room-gate.ts';
import {
  sellerRoomPath,
  sellerSignInPath,
} from '@odb/seller-rooms/members/entry-rules.ts';
import { getSupabaseServerClient } from '@odb/supabase/server';

export default async function OldSellerPortalPage(props: {
  params: Promise<{ locale: string; dealId: string }>;
}) {
  const { dealId } = await props.params;
  const client = getSupabaseServerClient();

  if (!(await isSignedIn(client))) {
    redirect(sellerSignInPath(`/seller/${dealId}`));
  }

  const { data: room } = await client
    .rpc('my_seller_rooms')
    .eq('deal_id', dealId)
    .maybeSingle()
    .throwOnError();

  redirect(room ? sellerRoomPath(room.id) : '/seller');
}
