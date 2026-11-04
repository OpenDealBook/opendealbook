'use client';

import type { ReactNode } from 'react';

import { useTranslations } from 'next-intl';

import { Skeleton } from '@odb/ui/skeleton';

export function LoadingPage({
  label,
  children,
}: {
  label: 'deals' | 'ai';
  children: ReactNode;
}) {
  const t = useTranslations('loading');

  return (
    <div
      role={'status'}
      aria-busy={'true'}
      aria-label={t(label)}
      className={'flex min-w-0 flex-col gap-6 p-4 md:p-8'}
    >
      {children}
    </div>
  );
}

export function ThreadListSkeleton() {
  return (
    <div className={'flex flex-col gap-1'}>
      {Array.from({ length: 5 }, (_, thread) => (
        <div key={thread} className={'flex flex-col gap-1.5 px-3 py-2'}>
          <Skeleton className={'h-2.5 w-24'} />
          <Skeleton className={'h-3 w-full'} />
          <Skeleton className={'h-2.5 w-16'} />
        </div>
      ))}
    </div>
  );
}

export function ConversationSkeleton() {
  return (
    <div className={'flex min-h-[32rem] flex-col rounded-lg border'}>
      <div className={'flex min-h-64 flex-1 flex-col gap-6 p-4'}>
        <Skeleton className={'h-8 w-1/2 self-end'} />
        <div className={'flex flex-col gap-2'}>
          <Skeleton className={'h-3 w-11/12'} />
          <Skeleton className={'h-3 w-4/5'} />
          <Skeleton className={'h-3 w-2/3'} />
        </div>
      </div>
      <div className={'border-t p-3'}>
        <Skeleton className={'h-20 w-full'} />
      </div>
    </div>
  );
}
