'use client';

import { type ComponentProps, createContext, use } from 'react';

import { useParams } from 'next/navigation';

import { FileText } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { AnswerPart } from '@odb/ai/parts';
import { Button } from '@odb/ui/button';

import { AnswerCitations } from './ai-citation';
import { openDataRoomWindow } from './data-room-document-link';

export const AnswerParts = createContext<AnswerPart[]>([]);

function DocumentCard({ part }: { part: AnswerPart }) {
  const t = useTranslations('dealAsk.card');
  const { account } = useParams<{ account: string }>();
  const { dealId, readable } = use(AnswerCitations)!;
  const available = Object.hasOwn(readable, part.documentId);
  const opensAt = [
    part.page === undefined ? '' : t('page', { page: part.page }),
    part.sheet === undefined ? '' : t('sheet', { sheet: part.sheet }),
  ].filter((place) => place !== '');

  return (
    <figure
      className={
        'bg-muted/30 my-3 flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-start'
      }
    >
      <figcaption className={'flex min-w-0 flex-1 items-start gap-3'}>
        <FileText
          aria-hidden
          className={'text-muted-foreground mt-0.5 size-4 shrink-0'}
        />
        <span className={'flex min-w-0 flex-col gap-0.5'}>
          <span className={'truncate text-sm font-medium'}>
            {part.documentName}
          </span>
          {opensAt.length > 0 ? (
            <span className={'text-muted-foreground text-xs'}>
              {opensAt.join(', ')}
            </span>
          ) : null}
          {available && readable[part.documentId] !== part.version ? (
            <span className={'text-muted-foreground text-xs italic'}>
              {t('newerVersion')}
            </span>
          ) : null}
          {part.note ? (
            <span className={'text-foreground/80 text-sm'}>{part.note}</span>
          ) : null}
        </span>
      </figcaption>
      {available ? (
        <Button
          type={'button'}
          variant={'outline'}
          size={'sm'}
          className={'self-start'}
          onClick={() =>
            openDataRoomWindow({
              account,
              dealId,
              doc: part.documentId,
              page: part.page,
              sheet: part.sheet,
            })
          }
        >
          {t('open')}
        </Button>
      ) : (
        <span className={'text-muted-foreground self-start text-xs'}>
          {t('unavailable')}
        </span>
      )}
    </figure>
  );
}

export function Figure({
  index,
}: ComponentProps<'figure'> & { index?: string }) {
  const part = use(AnswerParts)[Number(index)];

  return part ? <DocumentCard part={part} /> : null;
}
