import { Skeleton } from '@odb/ui/skeleton';

import {
  ConversationSkeleton,
  LoadingPage,
  ThreadListSkeleton,
} from '../loading-skeleton';

export default function TeamAiLoading() {
  return (
    <LoadingPage label={'ai'}>
      <div className={'border-border border-b pb-5'}>
        <Skeleton className={'h-9 w-16'} />
      </div>
      <div
        className={
          'grid gap-6 xl:grid-cols-[18rem_minmax(0,1fr)] xl:items-start'
        }
      >
        <div className={'flex min-w-0 flex-col gap-4'}>
          <div className={'flex flex-col gap-2'}>
            <Skeleton className={'h-3 w-24'} />
            <Skeleton className={'h-9 w-full'} />
          </div>
          <div className={'flex flex-col gap-2'}>
            <Skeleton className={'h-3 w-16'} />
            <ThreadListSkeleton />
          </div>
        </div>
        <div className={'flex min-w-0 flex-col gap-3'}>
          <div className={'flex items-center justify-between gap-3'}>
            <Skeleton className={'h-6 w-48'} />
            <Skeleton className={'h-8 w-24'} />
          </div>
          <ConversationSkeleton />
        </div>
      </div>
    </LoadingPage>
  );
}
