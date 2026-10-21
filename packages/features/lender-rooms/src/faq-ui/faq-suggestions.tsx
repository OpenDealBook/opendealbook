'use client';

import { useEffect, useEffectEvent, useState } from 'react';

import { CheckIcon, ChevronDownIcon, LightbulbIcon } from 'lucide-react';

import { Button } from '@odb/ui/button';
import { cn } from '@odb/ui/utils';

import { SESSION_ENDED } from '../actions/refusal';
import {
  recordFaqSuggestionOpened,
  recordFaqSuggestionResolved,
} from '../activity/actions';
import type { RoomFaqEntry } from '../faq/queries';
import { RefusalNote } from '../requests-ui/refusal-note';
import { searchRoomFaq } from './actions';
import { FaqEntryView } from './faq-entry-view';

const WORDS_BEFORE_SEARCHING = 3;
const PAUSE_BEFORE_SEARCHING_MS = 400;
const MOST_SUGGESTIONS = 3;

type Suggested =
  | { kind: 'entries'; entries: RoomFaqEntry[] }
  | { kind: 'session-ended' };

const NOTHING: Suggested = { kind: 'entries', entries: [] };

export function FaqSuggestions({
  roomId,
  draft,
  onShown,
  onAnswered,
}: {
  roomId: string;
  draft: string;
  onShown: () => void;
  onAnswered: () => void;
}) {
  const query = draft.trim().replace(/\s+/g, ' ');
  const isSearchable = query.split(' ').length >= WORDS_BEFORE_SEARCHING;
  const [suggested, setSuggested] = useState<Suggested>(NOTHING);
  const [openId, setOpenId] = useState<string | null>(null);
  const [refusals, setRefusals] = useState<ReadonlyMap<string, string>>(
    new Map(),
  );
  const reportShown = useEffectEvent(onShown);

  useEffect(() => {
    if (!isSearchable) {
      return;
    }

    let isCurrent = true;
    const timer = setTimeout(async () => {
      let next = NOTHING;

      try {
        const result = await searchRoomFaq({ roomId, query });

        if (result.ok) {
          next = {
            kind: 'entries',
            entries: result.value.slice(0, MOST_SUGGESTIONS),
          };
        } else if (result.refusal === SESSION_ENDED) {
          next = { kind: 'session-ended' };
        }
      } catch {}

      if (!isCurrent) {
        return;
      }

      setSuggested(next);

      if (next.kind === 'entries' && next.entries.length > 0) {
        reportShown();
      }
    }, PAUSE_BEFORE_SEARCHING_MS);

    return () => {
      isCurrent = false;
      clearTimeout(timer);
    };
  }, [roomId, query, isSearchable]);

  if (!isSearchable) {
    return null;
  }

  if (suggested.kind === 'session-ended') {
    return <RefusalNote refusal={SESSION_ENDED} />;
  }

  if (suggested.entries.length === 0) {
    return null;
  }

  function toggle(entryId: string) {
    if (openId === entryId) {
      setOpenId(null);
      return;
    }

    setOpenId(entryId);

    void recordFaqSuggestionOpened({ roomId, entryId }).then((result) => {
      if (!result.ok) {
        setRefusals((current) => new Map(current).set(entryId, result.refusal));
      }
    });
  }

  function answered(entryId: string) {
    void recordFaqSuggestionResolved({ roomId, entryId });
    onAnswered();
  }

  return (
    <section
      aria-label={'Answered in the FAQ'}
      className={'bg-muted/50 flex flex-col gap-1 rounded-lg border px-3 py-2'}
    >
      <p
        className={
          'text-muted-foreground flex items-center gap-1.5 text-xs font-medium'
        }
      >
        <LightbulbIcon aria-hidden className={'size-3.5'} />
        Already answered in the FAQ
      </p>
      <ul className={'divide-y'}>
        {suggested.entries.map((entry) => {
          const isOpen = openId === entry.id;
          const refusal = refusals.get(entry.id) ?? null;

          return (
            <li key={entry.id} className={'flex flex-col gap-2 py-2'}>
              <button
                type={'button'}
                aria-expanded={isOpen}
                onClick={() => toggle(entry.id)}
                className={
                  'focus-visible:ring-ring/50 hover:text-primary flex w-full items-start gap-2 rounded-sm text-left text-sm font-medium outline-none focus-visible:ring-[3px]'
                }
              >
                <span className={'min-w-0 flex-1'}>{entry.question}</span>
                <ChevronDownIcon
                  aria-hidden
                  className={cn(
                    'text-muted-foreground mt-0.5 size-4 shrink-0 transition-transform',
                    isOpen && 'rotate-180',
                  )}
                />
              </button>
              {isOpen ? (
                refusal ? (
                  <RefusalNote refusal={refusal} />
                ) : (
                  <div className={'flex flex-col gap-3 text-sm'}>
                    <FaqEntryView roomId={roomId} entry={entry} />
                    <Button
                      type={'button'}
                      variant={'outline'}
                      size={'sm'}
                      className={'w-fit'}
                      onClick={() => answered(entry.id)}
                    >
                      <CheckIcon />
                      This answered my question
                    </Button>
                  </div>
                )
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
