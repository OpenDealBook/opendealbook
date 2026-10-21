'use client';

import { useEffect, useRef, useState } from 'react';

import { ChevronDownIcon, PinIcon, SearchIcon } from 'lucide-react';

import { Input } from '@odb/ui/input';
import { Label } from '@odb/ui/label';
import { cn } from '@odb/ui/utils';

import { recordFaqEntryOpened, recordFaqPageOpened } from '../activity/actions';
import type { RoomFaqEntry } from '../faq/queries';
import { RefusalNote } from '../requests-ui/refusal-note';
import { searchRoomFaq } from './actions';
import { FaqEntryView } from './faq-entry-view';

const SEARCH_PAUSE_MS = 400;

function isNewSince(entry: RoomFaqEntry, since: string | null): boolean {
  return (
    since === null ||
    [entry.firstPublishedAt, entry.updatedAt].some(
      (at) => Date.parse(at) > Date.parse(since),
    )
  );
}

export function FaqBrowser({
  roomId,
  entries,
  since,
}: {
  roomId: string;
  entries: RoomFaqEntry[];
  since: string | null;
}) {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<{
    query: string;
    entries: RoomFaqEntry[];
  } | null>(null);
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(new Set());
  const [entryRefusals, setEntryRefusals] = useState<
    ReadonlyMap<string, string>
  >(new Map());
  const [refusal, setRefusal] = useState<string | null>(null);
  const pageOpenRecorded = useRef(false);

  useEffect(() => {
    if (pageOpenRecorded.current) {
      return;
    }

    pageOpenRecorded.current = true;

    void recordFaqPageOpened({ roomId }).then((result) => {
      if (!result.ok) {
        setRefusal(result.refusal);
      }
    });
  }, [roomId]);

  const needle = query.trim();

  useEffect(() => {
    if (needle === '') {
      return;
    }

    let isSuperseded = false;
    const timer = setTimeout(() => {
      void searchRoomFaq({ roomId, query: needle }).then((result) => {
        if (isSuperseded) {
          return;
        }

        if (result.ok) {
          setSearch({ query: needle, entries: result.value });
          setRefusal(null);
        } else {
          setRefusal(result.refusal);
        }
      });
    }, SEARCH_PAUSE_MS);

    return () => {
      isSuperseded = true;
      clearTimeout(timer);
    };
  }, [roomId, needle]);

  function toggle(entryId: string) {
    const next = new Set(openIds);

    if (next.delete(entryId)) {
      setOpenIds(next);
      return;
    }

    setOpenIds(next.add(entryId));

    void recordFaqEntryOpened({ roomId, entryId }).then((result) => {
      if (!result.ok) {
        setEntryRefusals((current) =>
          new Map(current).set(entryId, result.refusal),
        );
      }
    });
  }

  const shown = needle === '' ? entries : (search?.entries ?? entries);

  return (
    <div className={'flex flex-col gap-6'}>
      <div role={'search'} className={'flex max-w-xl items-center gap-2'}>
        <Label htmlFor={'faq-search'} className={'sr-only'}>
          Search the FAQ
        </Label>
        <div className={'relative flex-1'}>
          <SearchIcon
            aria-hidden
            className={
              'text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2'
            }
          />
          <Input
            id={'faq-search'}
            type={'search'}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={'Search questions and answers'}
            className={'pl-9'}
          />
        </div>
      </div>

      <RefusalNote refusal={refusal} />

      {shown.length === 0 ? (
        <p className={'text-muted-foreground'}>
          {search
            ? `Nothing in the FAQ matches “${search.query}”.`
            : 'No questions have been answered here yet.'}
        </p>
      ) : (
        <ul className={'divide-y border-y'}>
          {shown.map((entry) => {
            const isOpen = openIds.has(entry.id);
            const entryRefusal = entryRefusals.get(entry.id) ?? null;

            return (
              <li key={entry.id} className={'flex flex-col gap-3 py-4'}>
                <div className={'flex items-start gap-3'}>
                  <h3 className={'min-w-0 flex-1'}>
                    <button
                      type={'button'}
                      aria-expanded={isOpen}
                      onClick={() => toggle(entry.id)}
                      className={
                        'focus-visible:ring-ring/50 hover:text-primary w-full rounded-sm text-left font-medium text-balance outline-none focus-visible:ring-[3px]'
                      }
                    >
                      {entry.question}
                    </button>
                  </h3>
                  <span
                    className={
                      'flex shrink-0 items-center gap-3 text-xs empty:hidden'
                    }
                  >
                    {entry.pinned ? (
                      <span
                        className={
                          'text-muted-foreground inline-flex items-center gap-1'
                        }
                      >
                        <PinIcon aria-hidden className={'size-3.5'} />
                        Pinned
                      </span>
                    ) : null}
                    {isNewSince(entry, since) ? (
                      <span
                        className={
                          'text-primary inline-flex items-center gap-1 font-medium'
                        }
                      >
                        <span
                          aria-hidden
                          className={'bg-primary size-1.5 rounded-full'}
                        />
                        New
                      </span>
                    ) : null}
                  </span>
                  <ChevronDownIcon
                    aria-hidden
                    className={cn(
                      'text-muted-foreground mt-0.5 size-4 shrink-0 transition-transform',
                      isOpen && 'rotate-180',
                    )}
                  />
                </div>
                {isOpen ? (
                  <div>
                    {entryRefusal ? (
                      <RefusalNote refusal={entryRefusal} />
                    ) : (
                      <FaqEntryView roomId={roomId} entry={entry} />
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
