'use client';

import { createContext, use } from 'react';

import { useParams } from 'next/navigation';

import { useTranslations } from 'next-intl';

import {
  citationLabel,
  citationRange,
  type DocumentCitation,
} from '@odb/ai/citations';
import {
  InlineCitation,
  InlineCitationCard,
  InlineCitationCardBody,
  InlineCitationSource,
} from '@odb/ui/ai-elements/inline-citation';
import { MessageResponse } from '@odb/ui/ai-elements/message';
import { Badge } from '@odb/ui/badge';
import { HoverCardTrigger } from '@odb/ui/hover-card';

import { openDataRoomWindow } from './data-room-document-link';

const LABEL = /\[([^[\]]+ v\d+, [^[\]]+)\](?!\()/g;
const CODE =
  /^ {0,3}(`{3,}|~{3,}).*\n[\s\S]*?(?:^ {0,3}\1.*$|(?![\s\S]))|(?<!\\)(`+)(?!`)[\s\S]*?[^`]\2(?!`)/gm;

export const AnswerCitations = createContext<{
  dealId: string;
  citations: DocumentCitation[];
  readable: Record<string, number>;
} | null>(null);

function CitationPreview({ citation }: { citation: DocumentCitation }) {
  const t = useTranslations('dealAsk.citation');

  return (
    <InlineCitationCardBody className={'w-80 p-3'}>
      <InlineCitationSource title={citation.documentName}>
        <p className={'text-muted-foreground text-xs'}>
          {t('version', { version: citation.version })}
        </p>
        <p className={'text-muted-foreground text-xs'}>
          {'sheet' in citation
            ? t('cells', { sheet: citation.sheet, range: citation.cellRange })
            : citation.pageFrom === citation.pageTo
              ? t('page', { page: citation.pageFrom })
              : t('pages', { from: citation.pageFrom, to: citation.pageTo })}
        </p>
      </InlineCitationSource>
      {citation.excerpt ? (
        <blockquote
          className={
            'text-foreground/80 mt-2 border-l pl-3 font-serif text-sm leading-relaxed'
          }
        >
          {citation.excerpt}
        </blockquote>
      ) : null}
    </InlineCitationCardBody>
  );
}

export function Citation({
  index,
  rangeOnly = false,
}: {
  index?: unknown;
  rangeOnly?: boolean;
}) {
  const t = useTranslations('dealAsk');
  const { account } = useParams<{ account: string }>();
  const { dealId, citations, readable } = use(AnswerCitations)!;
  const citation = citations[Number(index)];

  if (!citation) {
    return null;
  }

  if (readable[citation.documentId] !== citation.version) {
    return (
      <Badge variant={'outline'} className={'text-muted-foreground mx-0.5'}>
        {rangeOnly
          ? t('rangeUnavailable', { range: citationRange(citation) })
          : t('citationUnavailable', { name: citation.documentName })}
      </Badge>
    );
  }

  return (
    <InlineCitation>
      <InlineCitationCard>
        <HoverCardTrigger asChild>
          <Badge asChild variant={'secondary'} className={'mx-0.5'}>
            <button
              type={'button'}
              onClick={() =>
                openDataRoomWindow({
                  account,
                  dealId,
                  doc: citation.documentId,
                  ...('sheet' in citation
                    ? { sheet: citation.sheet }
                    : { page: citation.pageFrom }),
                })
              }
            >
              {rangeOnly ? citationRange(citation) : citationLabel(citation)}
            </button>
          </Badge>
        </HoverCardTrigger>
        <CitationPreview citation={citation} />
      </InlineCitationCard>
    </InlineCitation>
  );
}

const COMPONENTS = { citation: Citation, img: () => null };
const ALLOWED_TAGS = { citation: ['index'] };

export function AiAnswer({
  dealId,
  text,
  citations,
  readable,
}: {
  dealId: string;
  text: string;
  citations: DocumentCitation[];
  readable: Record<string, number>;
}) {
  const t = useTranslations('dealAsk.links');

  function cite(prose: string) {
    return prose
      .replaceAll('<', '&lt;')
      .replace(LABEL, (written, label: string) => {
        const index = citations.findIndex(
          (cited) => citationLabel(cited) === label,
        );
        return index === -1
          ? written
          : `<citation index="${index}"></citation>`;
      });
  }

  let markdown = '';
  let at = 0;
  for (const code of text.matchAll(CODE)) {
    markdown += cite(text.slice(at, code.index)) + code[0];
    at = code.index + code[0].length;
  }
  markdown += cite(text.slice(at));

  return (
    <AnswerCitations value={{ dealId, citations, readable }}>
      <MessageResponse
        translations={{
          openExternalLink: t('openExternalLink'),
          externalLinkWarning: t('externalLinkWarning'),
          openLink: t('openLink'),
          copyLink: t('copyLink'),
          copied: t('copied'),
          close: t('close'),
        }}
        mode={'static'}
        controls={false}
        allowedTags={ALLOWED_TAGS}
        components={COMPONENTS}
      >
        {markdown}
      </MessageResponse>
    </AnswerCitations>
  );
}

export function AnswerSources({
  dealId,
  citations,
  readable,
}: {
  dealId: string;
  citations: DocumentCitation[];
  readable: Record<string, number>;
}) {
  const t = useTranslations('dealAsk');
  const documents = Map.groupBy(
    citations.keys(),
    (index) => citations[index]!.documentId,
  );

  if (documents.size === 0) {
    return null;
  }

  return (
    <AnswerCitations value={{ dealId, citations, readable }}>
      <footer className={'flex flex-col gap-2 border-t pt-3'}>
        <h4 className={'font-serif text-sm font-medium'}>{t('sources')}</h4>
        <ul className={'flex flex-col gap-1.5'}>
          {[...documents].map(([documentId, indexes]) => {
            const { documentName, version } = citations[indexes[0]!]!;
            return (
              <li
                key={documentId}
                className={'flex flex-wrap items-baseline gap-x-1 gap-y-1'}
              >
                <span className={'mr-1 text-sm'}>
                  {`${documentName} v${version}`}
                </span>
                {indexes.map((index) => (
                  <Citation key={index} index={index} rangeOnly />
                ))}
              </li>
            );
          })}
        </ul>
      </footer>
    </AnswerCitations>
  );
}
