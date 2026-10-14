import Link from 'next/link';
import { redirect } from 'next/navigation';

import { PurgeUnfinishedUploads } from '@odb/lender-rooms/browser/purge-unfinished-uploads.tsx';
import { LenderNameForm } from '@odb/lender-rooms/members/lender-name-form.tsx';
import {
  lenderNames,
  shouldAskLenderName,
} from '@odb/lender-rooms/members/person-name.ts';
import { isSignedIn } from '@odb/lender-rooms/members/room-gate.ts';
import { getSupabaseServerClient } from '@odb/supabase/server';
import { Badge } from '@odb/ui/badge';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@odb/ui/card';

export default async function LenderRoomsPage() {
  const client = getSupabaseServerClient();

  if (!(await isSignedIn(client))) {
    redirect('/lender/sign-in');
  }

  if (await shouldAskLenderName(client)) {
    return (
      <main>
        <LenderNameForm initialName={null} allowSkip />
      </main>
    );
  }

  const {
    data: { user },
  } = await client.auth.getUser();
  const name = (await lenderNames(client, [user!.id])).get(user!.id) ?? null;

  const { data: rooms } = await client.rpc('my_lender_rooms').throwOnError();

  return (
    <main className={'flex flex-col gap-4'}>
      <PurgeUnfinishedUploads
        userId={user!.id}
        openRoomIds={rooms
          .filter((room) => room.is_open)
          .map((room) => room.id!)}
      />

      <header className={'flex flex-col gap-2'}>
        <h1 className={'text-2xl font-semibold'}>Your lender rooms</h1>
        <p className={'text-muted-foreground text-sm'}>
          Signed in as {name ?? user!.email}
        </p>
        <details className={'text-sm'}>
          <summary>Change your name</summary>
          <LenderNameForm initialName={name} allowSkip={false} />
        </details>
      </header>

      {rooms.length === 0 && <p>You are not in any lender rooms.</p>}

      {rooms.map((room) => (
        <Link key={room.id} href={`/lender/${room.id}`}>
          <Card>
            <CardHeader>
              <CardTitle className={'flex items-center gap-2'}>
                {room.name}
                {!room.is_open && <Badge variant={'secondary'}>Closed</Badge>}
              </CardTitle>
              <CardDescription>{room.deal_name}</CardDescription>
              <CardDescription>{room.deal_description}</CardDescription>
            </CardHeader>
          </Card>
        </Link>
      ))}

      <Link className={'text-sm underline'} href={'/onboarding'}>
        Set up your own Open Deal Book account
      </Link>
    </main>
  );
}
