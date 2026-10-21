import Link from 'next/link';
import { redirect } from 'next/navigation';

import { headerFacts } from '@odb/lender-rooms/browser/header-facts.ts';
import { PurgeUnfinishedUploads } from '@odb/lender-rooms/browser/purge-unfinished-uploads.tsx';
import { LenderNameForm } from '@odb/lender-rooms/members/lender-name-form.tsx';
import {
  lenderNames,
  shouldAskLenderName,
  shouldAskLenderPhone,
} from '@odb/lender-rooms/members/person-name.ts';
import { isSignedIn } from '@odb/lender-rooms/members/room-gate.ts';
import { getSupabaseServerClient } from '@odb/supabase/server';
import { Badge } from '@odb/ui/badge';
import { Button } from '@odb/ui/button';
import { Input } from '@odb/ui/input';

import { PhonePrompt } from '../_components/phone-prompt';

export default async function LenderRoomsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = '' } = await searchParams;
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

  if (await shouldAskLenderPhone(client)) {
    return (
      <main>
        <PhonePrompt />
      </main>
    );
  }

  const {
    data: { user },
  } = await client.auth.getUser();
  const name = (await lenderNames(client, [user!.id])).get(user!.id) ?? null;

  const [{ data: rooms }, { data: sellerRooms }] = await Promise.all([
    client.rpc('my_lender_room_list').throwOnError(),
    client.rpc('my_seller_rooms').throwOnError(),
  ]);

  const needle = q.trim().toLowerCase();
  const found = rooms
    .map((row) => ({ row, facts: headerFacts(row.room) }))
    .filter(({ facts }) =>
      [facts.dealName, facts.buyerTeam, facts.lenderName].some((text) =>
        text?.toLowerCase().includes(needle),
      ),
    );

  return (
    <main className={'flex flex-col gap-4'}>
      <PurgeUnfinishedUploads
        userId={user!.id}
        openRoomIds={[...rooms.map(({ room }) => room), ...sellerRooms]
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

      {rooms.length === 0 ? (
        <p>You are not in any lender rooms.</p>
      ) : (
        <form className={'flex max-w-md gap-2'}>
          <Input
            name={'q'}
            type={'search'}
            aria-label={'Search rooms'}
            placeholder={'Deal, buyer or bank'}
            defaultValue={q}
          />
          <Button type={'submit'} variant={'outline'}>
            Search
          </Button>
        </form>
      )}

      {rooms.length > 0 && found.length === 0 ? (
        <p className={'text-muted-foreground'}>No rooms match {q}</p>
      ) : null}

      <ul className={'flex flex-col gap-3'}>
        {found.map(({ row, facts }) => (
          <li key={row.room.id}>
            <Link
              href={`/lender/${row.room.id}`}
              className={
                'bg-card hover:bg-accent focus-visible:ring-ring/50 flex flex-col gap-3 rounded-xl border p-5 outline-none focus-visible:ring-[3px] sm:flex-row sm:items-start sm:justify-between'
              }
            >
              <div className={'flex min-w-0 flex-col gap-1'}>
                <p className={'font-serif text-xl font-medium'}>
                  {facts.dealName}
                </p>
                {facts.buyerTeam ? (
                  <p className={'text-muted-foreground text-sm'}>
                    {facts.buyerTeam}
                  </p>
                ) : null}
                {facts.loanAsk ? (
                  <p className={'text-sm tabular-nums'}>{facts.loanAsk}</p>
                ) : null}
                {facts.closeBy ? (
                  <p className={'text-sm'}>Close by {facts.closeBy}</p>
                ) : null}
                <p className={'text-muted-foreground text-xs'}>
                  Prepared for {facts.lenderName}
                </p>
              </div>
              <div
                className={
                  'flex shrink-0 flex-wrap gap-2 sm:flex-col sm:items-end'
                }
              >
                <Badge variant={row.room.is_open ? 'outline' : 'secondary'}>
                  {row.room.is_open ? 'Open' : 'Closed'}
                </Badge>
                {row.your_turn_count > 0 ? (
                  <Badge>{row.your_turn_count} answered, your turn</Badge>
                ) : null}
                {row.new_count > 0 ? (
                  <Badge variant={'outline'}>
                    {row.new_count} new since your last visit
                  </Badge>
                ) : null}
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <Link className={'text-sm underline'} href={'/onboarding'}>
        Set up your own Open Deal Book account
      </Link>
    </main>
  );
}
