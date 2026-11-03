'use client';

import { createContext, use } from 'react';

import { useParams } from 'next/navigation';

import { useTranslations } from 'next-intl';

import { citationLabel, type DocumentCitation } from '@odb/ai/citations';
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
    <InlineCitationCardBody className={'w-64 p-3'}>
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
    </InlineCitationCardBody>
  );
}

export function Citation({ index }: { index?: unknown }) {
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
        {t('citationUnavailable', { name: citation.documentName })}
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
              {citationLabel(citation)}
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
