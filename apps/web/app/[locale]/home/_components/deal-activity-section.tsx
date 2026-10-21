'use client';

import { useState, useTransition } from 'react';

import { type DealActivityEntry, fetchDealActivity } from '@odb/deals/shared';
import { LocalTime } from '@odb/lender-rooms/requests-ui/local-time.tsx';
import { getSupabaseBrowserClient } from '@odb/supabase/client';
import { Button } from '@odb/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@odb/ui/card';

export function DealActivitySection({
  dealId,
  accountId,
  first,
}: {
  dealId: string;
  accountId: string;
  first: { entries: DealActivityEntry[]; more: boolean };
}) {
  const [pages, setPages] = useState([first]);
  const [loading, startLoading] = useTransition();
  const more = pages.at(-1)!.more;

  function showMore() {
    startLoading(async () => {
      const next = await fetchDealActivity(
        getSupabaseBrowserClient(),
        dealId,
        accountId,
        pages.length,
      );
      setPages((loaded) => [...loaded, next]);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity</CardTitle>
      </CardHeader>
      <CardContent className={'flex flex-col gap-3'}>
        <ol className={'flex flex-col divide-y'}>
          {pages
            .flatMap((page) => page.entries)
            .map((entry) => (
              <li
                key={entry.id}
                className={
                  'flex flex-col gap-0.5 py-2.5 text-sm sm:flex-row sm:items-baseline sm:justify-between sm:gap-4'
                }
              >
                <p>
                  <span className={'font-medium'}>{entry.who}</span>{' '}
                  {entry.what}
                </p>
                <span
                  className={
                    'text-muted-foreground shrink-0 text-xs tabular-nums'
                  }
                >
                  <LocalTime at={entry.at} />
                </span>
              </li>
            ))}
        </ol>
        {more ? (
          <Button
            variant={'outline'}
            size={'sm'}
            className={'self-start'}
            disabled={loading}
            onClick={showMore}
          >
            Show more
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
