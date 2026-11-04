'use client';

import { useSearchParams } from 'next/navigation';

import { Card } from '@odb/ui/card';
import { PageHeader } from '@odb/ui/page-header';
import { Skeleton } from '@odb/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@odb/ui/table';

import { parseDealParams } from '../../../_components/deals-search-params';
import { LoadingPage } from '../../loading-skeleton';

const HEAD_WIDTHS = ['w-40', 'w-20', 'w-24', 'w-24', 'w-16'];

export default function DealsLoading() {
  const view = parseDealParams({
    view: useSearchParams().get('view') ?? undefined,
  }).view;

  return (
    <LoadingPage label={'deals'}>
      <PageHeader title={'Deals'} />
      <div className={'flex flex-col gap-6 lg:flex-row'}>
        <Skeleton className={'h-8 w-20 self-start md:hidden'} />
        <div className={'hidden w-72 shrink-0 flex-col gap-6 md:flex'}>
          {Array.from({ length: 5 }, (_, group) => (
            <div key={group} className={'flex flex-col gap-2'}>
              <Skeleton className={'h-3 w-20'} />
              <Skeleton className={'h-9 w-full'} />
            </div>
          ))}
        </div>
        <div className={'flex min-w-0 flex-1 flex-col gap-4'}>
          <div className={'flex flex-wrap items-center justify-between gap-2'}>
            <Skeleton className={'h-8 w-48'} />
            <div className={'flex items-center gap-2'}>
              <Skeleton className={'h-8 w-24'} />
              <Skeleton className={'h-8 w-24'} />
            </div>
          </div>
          {view === 'table' ? (
            <Table>
              <TableHeader>
                <TableRow>
                  {HEAD_WIDTHS.map((width) => (
                    <TableHead key={width}>
                      <Skeleton className={`h-2.5 ${width}`} />
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: 8 }, (_, row) => (
                  <TableRow key={row}>
                    {HEAD_WIDTHS.map((width) => (
                      <TableCell key={width}>
                        <Skeleton className={`h-3 ${width}`} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className={'flex flex-col gap-3'}>
              <Skeleton className={'h-2.5 w-32'} />
              <div
                className={
                  'grid grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] gap-4'
                }
              >
                {Array.from({ length: 6 }, (_, card) => (
                  <Card key={card} className={'gap-4 py-5 pr-4 pl-5'}>
                    <div className={'flex flex-col gap-1.5'}>
                      <Skeleton className={'h-4 w-3/5'} />
                      <Skeleton className={'h-3 w-2/5'} />
                    </div>
                    <div className={'grid grid-cols-2 gap-x-2 gap-y-3'}>
                      {Array.from({ length: 4 }, (_, figure) => (
                        <div key={figure} className={'flex flex-col gap-1'}>
                          <Skeleton className={'h-2.5 w-12'} />
                          <Skeleton className={'h-3.5 w-16'} />
                        </div>
                      ))}
                    </div>
                    <Skeleton className={'h-5 w-24'} />
                    <Skeleton className={'h-2.5 w-28'} />
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </LoadingPage>
  );
}
