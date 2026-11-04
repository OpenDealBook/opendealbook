import Link from 'next/link';

import { ArrowLeftIcon } from 'lucide-react';
import { z } from 'zod';

import { getSupabaseServerClient } from '@odb/supabase/server';
import { PageHeader } from '@odb/ui/page-header';

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
      <PageHeader
        eyebrow={
          <Link
            href={`/lender/${roomId}`}
            className={
              'hover:text-foreground flex min-h-6 w-fit items-center gap-1.5'
            }
          >
            <ArrowLeftIcon className={'size-4'} />
            {room.deal_name}
          </Link>
        }
        title={'FAQ'}
      />

      <FaqBrowser roomId={roomId} entries={entries} since={since} />
    </main>
  );
}
