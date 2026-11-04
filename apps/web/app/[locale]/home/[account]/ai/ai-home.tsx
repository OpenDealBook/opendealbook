'use client';

import { useState } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { useFormatter, useTranslations } from 'next-intl';

import { Button } from '@odb/ui/button';
import { PageHeader } from '@odb/ui/page-header';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@odb/ui/select';

import { DealAskPanel } from '../../_components/deal-ask-panel';
import type {
  AiThreadCursor,
  AiThreadSummary,
  loadDealAsk,
} from '../../_lib/deal-ask-data';
import { loadMoreAiThreads } from './actions';

interface ThreadPage {
  threads: AiThreadSummary[];
  next: AiThreadCursor | null;
}

interface OpenAsk {
  dealId: string;
  threadId: string | null;
  dealName: string;
  dealHref: string;
  ask: NonNullable<Awaited<ReturnType<typeof loadDealAsk>>>;
}

export function AiHome({
  basePath,
  teamId,
  firstPage,
  deals,
  aiConnected,
  settingsHref,
  open,
  viewerId,
  now,
}: {
  basePath: string;
  teamId: string;
  firstPage: ThreadPage;
  deals: { id: string; name: string }[];
  aiConnected: boolean;
  settingsHref: string;
  open: OpenAsk | null;
  viewerId: string;
  now: number;
}) {
  const t = useTranslations('aiHome');
  const format = useFormatter();
  const router = useRouter();
  const [loaded, setLoaded] = useState<ThreadPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const opened = open ? `${open.dealId}:${open.threadId}` : null;
  const [panel, setPanel] = useState({
    navigatedTo: opened,
    showing: opened,
    generation: 0,
  });
  const next = loaded ? loaded.next : firstPage.next;
  const threads = [
    ...new Map(
      [...firstPage.threads, ...(loaded?.threads ?? [])].map((thread) => [
        thread.id,
        thread,
      ]),
    ).values(),
  ];

  if (opened !== panel.navigatedTo) {
    setPanel({
      navigatedTo: opened,
      showing: opened,
      generation:
        opened === panel.showing ? panel.generation : panel.generation + 1,
    });
  }

  function threadChanged(dealId: string, threadId: string | null) {
    setPanel((current) => ({ ...current, showing: `${dealId}:${threadId}` }));
    router.replace(
      threadId
        ? `${basePath}?thread=${threadId}`
        : `${basePath}?deal=${dealId}`,
    );
  }

  async function loadMore(after: AiThreadCursor) {
    setLoading(true);
    setLoadFailed(false);
    try {
      const page = await loadMoreAiThreads({ teamId, after });
      setLoaded((current) => ({
        threads: [...(current?.threads ?? []), ...page.threads],
        next: page.next,
      }));
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={'flex min-w-0 flex-col gap-6 p-4 md:p-8'}>
      <PageHeader title={t('title')} />
      <div
        className={
          'grid gap-6 xl:grid-cols-[18rem_minmax(0,1fr)] xl:items-start'
        }
      >
        <aside className={'flex min-w-0 flex-col gap-4'}>
          {deals.length > 0 ? (
            <div className={'flex flex-col gap-2'}>
              <h2 className={'text-sm font-medium'}>{t('newQuestion')}</h2>
              <Select
                value={open && open.threadId === null ? open.dealId : ''}
                disabled={!aiConnected}
                onValueChange={(dealId) =>
                  router.push(`${basePath}?deal=${dealId}`)
                }
              >
                <SelectTrigger className={'w-full'}>
                  <SelectValue placeholder={t('pickDeal')} />
                </SelectTrigger>
                <SelectContent>
                  {deals.map((deal) => (
                    <SelectItem key={deal.id} value={deal.id}>
                      {deal.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {aiConnected ? null : (
                <p className={'text-muted-foreground text-sm'}>
                  {t('connectBody')}{' '}
                  <Link
                    href={settingsHref}
                    className={'text-foreground underline underline-offset-4'}
                  >
                    {t('connectAction')}
                  </Link>
                </p>
              )}
            </div>
          ) : null}
          <nav aria-label={t('threads')} className={'flex flex-col gap-2'}>
            <h2 className={'text-sm font-medium'}>{t('threads')}</h2>
            {threads.length === 0 ? (
              <p className={'text-muted-foreground text-sm'}>
                {t('noThreads')}
              </p>
            ) : (
              <ul
                className={
                  'flex max-h-64 flex-col gap-1 overflow-y-auto xl:max-h-[40rem]'
                }
              >
                {threads.map((thread) => (
                  <li key={thread.id}>
                    <Link
                      href={`${basePath}?thread=${thread.id}`}
                      aria-current={
                        thread.id === open?.threadId ? 'page' : undefined
                      }
                      className={
                        'hover:bg-muted aria-[current]:bg-muted flex flex-col gap-0.5 rounded-md px-3 py-2 text-sm'
                      }
                    >
                      <span
                        data-deal
                        className={
                          'text-muted-foreground truncate text-xs font-medium'
                        }
                      >
                        {thread.dealName}
                      </span>
                      <span data-first-question className={'line-clamp-2'}>
                        {thread.question}
                      </span>
                      <span className={'text-muted-foreground text-xs'}>
                        {format.dateTime(new Date(thread.lastAskedAt), {
                          dateStyle: 'medium',
                        })}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {loadFailed ? (
              <p role={'alert'} className={'text-destructive text-sm'}>
                {t('loadFailed')}
              </p>
            ) : null}
            {next ? (
              <Button
                type={'button'}
                variant={'ghost'}
                size={'sm'}
                disabled={loading}
                onClick={() => loadMore(next)}
              >
                {t('loadMore')}
              </Button>
            ) : null}
          </nav>
        </aside>
        {open ? (
          <section className={'flex min-w-0 flex-col gap-3'}>
            <div
              data-open-deal
              className={'flex items-center justify-between gap-3'}
            >
              <h2 className={'min-w-0 truncate text-lg font-semibold'}>
                <Link href={open.dealHref} className={'hover:underline'}>
                  {open.dealName}
                </Link>
              </h2>
              <Button asChild variant={'outline'} size={'sm'}>
                <Link href={`${basePath}?deal=${open.dealId}`}>
                  {t('newThread')}
                </Link>
              </Button>
            </div>
            <DealAskPanel
              key={panel.generation}
              {...open.ask}
              dealId={open.dealId}
              viewerId={viewerId}
              now={now}
              settingsHref={settingsHref}
              initialThreadId={open.threadId ?? undefined}
              showThreadList={false}
              onThreadChange={(threadId) =>
                threadChanged(open.dealId, threadId)
              }
            />
          </section>
        ) : (
          <p
            className={
              'text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm'
            }
          >
            {t('nothingOpen')}
          </p>
        )}
      </div>
    </main>
  );
}
