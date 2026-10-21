'use client';

import { useParams } from 'next/navigation';

import type { CalcCitation } from '@odb/deals/shared';
import { Badge } from '@odb/ui/badge';
import { Button } from '@odb/ui/button';

import { openDataRoomWindow } from './data-room-document-link';

export interface InputRef {
  rowId: string | null;
  field: string;
}

export function citesInput(citation: CalcCitation, input: InputRef): boolean {
  return citation.rowId === input.rowId && citation.inputKey === input.field;
}

function where(locator: CalcCitation['locator']): string {
  switch (locator.kind) {
    case 'page':
      return `, page ${locator.page}`;
    case 'sheet':
      return `, sheet ${locator.sheet}`;
    case 'document':
      return '';
  }
}

function citationText(citation: CalcCitation): string {
  const cell = citation.cell === null ? '' : `, cell ${citation.cell}`;

  return `${citation.documentName} v${citation.documentVersion}${where(citation.locator)}${cell}`;
}

function openCitation(account: string, dealId: string, citation: CalcCitation) {
  openDataRoomWindow({
    account,
    dealId,
    doc: citation.documentId,
    page: citation.locator.kind === 'page' ? citation.locator.page : undefined,
    sheet:
      citation.locator.kind === 'sheet' ? citation.locator.sheet : undefined,
  });
}

export function CitationList(props: {
  dealId: string;
  citations: CalcCitation[];
  onRemove?: (citation: CalcCitation) => void;
}) {
  const { account } = useParams<{ account: string }>();
  const onRemove = props.onRemove;

  return (
    <ul className={'flex flex-col gap-1'}>
      {props.citations.map((citation) => (
        <li key={citation.id} className={'flex items-start gap-1'}>
          <div className={'flex min-w-0 flex-1 flex-col items-start'}>
            <button
              type={'button'}
              className={
                'text-primary text-left text-sm underline-offset-4 hover:underline'
              }
              onClick={() => openCitation(account, props.dealId, citation)}
            >
              {citationText(citation)}
            </button>
            {citation.newerVersionUploaded ? (
              <Badge variant={'outline'} className={'border-warning'}>
                Newer version uploaded
              </Badge>
            ) : null}
            {citation.documentRemoved ? (
              <Badge variant={'destructive'}>Document removed</Badge>
            ) : null}
          </div>
          {onRemove ? (
            <Button
              type={'button'}
              variant={'ghost'}
              size={'sm'}
              aria-label={`Remove ${citationText(citation)}`}
              onClick={() => onRemove(citation)}
            >
              Remove
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
