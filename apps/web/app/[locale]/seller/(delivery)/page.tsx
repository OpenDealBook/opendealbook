import Link from 'next/link';
import { redirect } from 'next/navigation';

import { isSignedIn } from '@odb/lender-rooms/members/room-gate.ts';
import { sellerRoomPath } from '@odb/seller-rooms/members/entry-rules.ts';
import { getSupabaseServerClient } from '@odb/supabase/server';
import { Badge } from '@odb/ui/badge';
import { Card, CardDescription, CardHeader, CardTitle } from '@odb/ui/card';

export default async function SellerRoomsPage() {
  const client = getSupabaseServerClient();

  if (!(await isSignedIn(client))) {
    redirect('/seller/sign-in');
  }

  const [{ data: sellerRooms }, { data: lenderRooms }] = await Promise.all([
    client.rpc('my_seller_rooms').throwOnError(),
    client.rpc('my_lender_rooms').throwOnError(),
  ]);

  return (
    <main className={'flex flex-col gap-4'}>
      <h1 className={'text-2xl font-semibold'}>Your rooms</h1>

      {sellerRooms.map((room) => (
        <Link key={room.id} href={sellerRoomPath(room.id)}>
          <Card>
            <CardHeader>
              <CardTitle className={'flex items-center gap-2'}>
                Selling {room.deal_name}
                {room.is_open ? null : (
                  <Badge variant={'outline'}>Closed</Badge>
                )}
              </CardTitle>
              <CardDescription>with {room.team_name}</CardDescription>
            </CardHeader>
          </Card>
        </Link>
      ))}

      {lenderRooms.length > 0 ? (
        <Link href={'/lender'} className={'font-medium underline'}>
          Your lender rooms
        </Link>
      ) : null}
    </main>
  );
}
