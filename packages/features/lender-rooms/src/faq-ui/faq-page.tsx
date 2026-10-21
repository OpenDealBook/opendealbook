import Link from 'next/link';

import { ArrowLeftIcon } from 'lucide-react';
import { z } from 'zod';

import { getSupabaseServerClient } from '@odb/supabase/server';

import { getLastRoomVisit } from '../contents/last-visit';
import { fetchRoomFaq } from '../faq/queries';
import type { LenderRoomSummary } from '../members/entry-rules';
import { FaqBrowser } from './faq-browser';

export async function FaqPage({ room }: { room: LenderRoomSummary }) {
  const client = getSupabaseServerClient();
  const roomId = z.uuid().parse(room.id);

  const [entries, since] = await Promise.all([
    fetchRoomFaq(client, roomId),
    getLastRoomVisit(client, roomId),
  ]);

  return (
    <main className={'flex flex-col gap-8'}>
      <header className={'flex flex-col gap-3'}>
        <Link
          href={`/lender/${roomId}`}
          className={
            'text-muted-foreground hover:text-foreground flex min-h-6 w-fit items-center gap-1.5 text-sm'
          }
        >
          <ArrowLeftIcon className={'size-4'} />
          {room.deal_name}
        </Link>
        <h1 className={'font-serif text-3xl font-medium'}>FAQ</h1>
      </header>

      <FaqBrowser roomId={roomId} entries={entries} since={since} />
    </main>
  );
}
