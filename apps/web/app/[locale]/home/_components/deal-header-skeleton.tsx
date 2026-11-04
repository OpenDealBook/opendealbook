import { useTranslations } from 'next-intl';

import { Skeleton } from '@odb/ui/skeleton';

import { DealSubnav } from './deal-subnav';

export function DealHeaderSkeleton() {
  const t = useTranslations('loading');

  return (
    <div className={'contents'}>
      <div
        role={'status'}
        aria-busy={'true'}
        aria-label={t('deal')}
        className={'contents'}
      >
        <div
          className={
            'bg-background sticky top-0 z-20 flex h-14 items-center gap-2 px-4 md:px-8'
          }
        >
          <Skeleton className={'h-4 w-12'} />
          <Skeleton className={'h-7 w-64'} />
        </div>
        <div className={'flex flex-col gap-4 px-4 pb-4 md:px-8'}>
          <div className={'flex flex-wrap items-start justify-between gap-3'}>
            <Skeleton className={'h-5 w-16'} />
            <div className={'flex gap-2'}>
              <Skeleton className={'h-9 w-48'} />
              <Skeleton className={'h-8 w-24'} />
              <Skeleton className={'h-8 w-16'} />
            </div>
          </div>
          <div
            className={
              'grid grid-cols-2 gap-x-8 gap-y-4 border-t pt-4 sm:grid-cols-5'
            }
          >
            {Array.from({ length: 5 }, (_, figure) => (
              <div key={figure} className={'flex flex-col gap-1.5'}>
                <Skeleton className={'h-3 w-16'} />
                <Skeleton className={'h-7 w-24'} />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div
        className={
          'bg-background sticky top-14 z-20 border-b px-4 pt-2 md:px-8'
        }
      >
        <DealSubnav />
      </div>
    </div>
  );
}
