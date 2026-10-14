import Link from 'next/link';

import { getSupabaseServerClient } from '@odb/supabase/server';

import { loadRequests } from './load-requests';
import { openRequestCounts, summaryWording } from './wording';

export async function OpenRequestsSummary({
  roomId,
  dealName,
}: {
  roomId: string;
  dealName: string | null;
}) {
  const { asks, forms } = await loadRequests(getSupabaseServerClient(), roomId);
  const counts = openRequestCounts([...asks, ...forms]);

  return (
    <Link
      href={`/lender/${roomId}/requests`}
      className={
        'hover:bg-accent focus-visible:ring-ring/50 flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-lg border px-4 py-3 text-sm outline-none focus-visible:ring-[3px]'
      }
    >
      <span className={'font-medium'}>Your requests</span>
      {summaryWording(counts, dealName).map((line) => (
        <span key={line} className={'text-muted-foreground'}>
          {line}
        </span>
      ))}
    </Link>
  );
}
