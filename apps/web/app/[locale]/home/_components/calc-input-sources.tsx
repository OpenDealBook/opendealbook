'use client';

import { type ReactNode, useId, useState } from 'react';

import {
  addCalcInputCitation,
  removeCalcInputCitation,
} from '@odb/deals/server';
import type {
  CalcCitation,
  CalcSources,
  CitableDocument,
} from '@odb/deals/shared';
import { Button } from '@odb/ui/button';
import { Input } from '@odb/ui/input';
import { Label } from '@odb/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@odb/ui/sheet';
import { cn } from '@odb/ui/utils';

import { CitationList, type InputRef, citesInput } from './calc-citation-list';
import { useRefusableAction } from './use-refusable-action';

function CalcInputSources(props: {
  sources: CalcSources;
  input: InputRef;
  label: string;
  unsaved?: boolean;
}) {
  const { refusal, pending, run } = useRefusableAction();
  const citations = props.sources.citations.filter((citation) =>
    citesInput(citation, props.input),
  );
  const stale = citations.some(
    (citation) => citation.newerVersionUploaded || citation.documentRemoved,
  );

  if (props.unsaved) {
    return (
      <Button
        type={'button'}
        variant={'ghost'}
        size={'sm'}
        disabled
        aria-label={`Cite source for ${props.label}`}
        title={'Save the calc to add sources to this row'}
        className={'text-muted-foreground h-7 px-1.5 text-xs'}
      >
        Cite
      </Button>
    );
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          type={'button'}
          variant={'ghost'}
          size={'sm'}
          aria-label={`Cite source for ${props.label}`}
          className={cn(
            'text-muted-foreground h-7 gap-1 px-1.5 text-xs',
            citations.length > 0 && 'text-foreground',
            stale && 'text-warning',
          )}
        >
          {citations.length === 0
            ? 'Cite'
            : `${citations.length} ${citations.length === 1 ? 'source' : 'sources'}`}
        </Button>
      </SheetTrigger>
      <SheetContent className={'w-full overflow-y-auto sm:max-w-md'}>
        <SheetHeader className={'p-6 pr-12'}>
          <SheetTitle>Sources for {props.label}</SheetTitle>
          <SheetDescription>
            Where this figure is in the data room. Opening one shows it in the
            data room window.
          </SheetDescription>
        </SheetHeader>
        <div className={'flex flex-col gap-6 px-6 pb-6'}>
          {citations.length === 0 ? (
            <p className={'text-muted-foreground text-sm'}>No sources yet</p>
          ) : (
            <CitationList
              dealId={props.sources.dealId}
              citations={citations}
              onRemove={
                props.sources.canEdit
                  ? (citation) =>
                      run(() =>
                        removeCalcInputCitation({
                          calc_version_id: props.sources.calcVersionId,
                          citation_id: citation.id,
                        }),
                      )
                  : undefined
              }
            />
          )}
          {refusal ? (
            <p role={'alert'} className={'text-destructive text-sm'}>
              {refusal}
            </p>
          ) : null}
          {props.sources.canEdit ? (
            <AddSource
              documents={props.sources.documents}
              pending={pending}
              onAdd={(citation) =>
                run(() =>
                  addCalcInputCitation({
                    calc_version_id: props.sources.calcVersionId,
                    ...(props.input.rowId === null
                      ? {}
                      : { row_id: props.input.rowId }),
                    input_key: props.input.field,
                    ...citation,
                  }),
                )
              }
            />
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function locatorFor(
  document: CitableDocument,
  where: string,
): CalcCitation['locator'] {
  switch (document.locator) {
    case 'page':
      return { kind: 'page', page: Number(where) };
    case 'sheet':
      return { kind: 'sheet', sheet: where.trim() };
    case 'document':
      return { kind: 'document' };
  }
}

const WHERE_LABEL = { page: 'Page', sheet: 'Sheet' };

function AddSource(props: {
  documents: CitableDocument[];
  pending: boolean;
  onAdd: (citation: {
    dr_document_id: string;
    locator: CalcCitation['locator'];
    cell?: string;
  }) => void;
}) {
  const [document, setDocument] = useState<CitableDocument | null>(null);
  const [olderShown, setOlderShown] = useState(false);
  const [where, setWhere] = useState('');
  const [cell, setCell] = useState('');
  const id = useId();
  const offered = props.documents.filter((each) => olderShown || each.latest);
  const ready =
    document !== null &&
    (document.locator === 'document' || where.trim() !== '');

  function add(chosen: CitableDocument) {
    props.onAdd({
      dr_document_id: chosen.id,
      locator: locatorFor(chosen, where),
      ...(cell.trim() === '' ? {} : { cell: cell.trim() }),
    });
    setWhere('');
    setCell('');
  }

  return (
    <section className={'flex flex-col gap-3 border-t pt-4'}>
      <div className={'flex items-center justify-between gap-2'}>
        <h3 className={'text-sm font-medium'}>Add a source</h3>
        {olderShown || props.documents.every((each) => each.latest) ? null : (
          <Button
            type={'button'}
            variant={'link'}
            size={'sm'}
            className={'h-auto p-0'}
            onClick={() => setOlderShown(true)}
          >
            Show older versions
          </Button>
        )}
      </div>
      {offered.length === 0 ? (
        <p className={'text-muted-foreground text-sm'}>
          No files in the data room yet
        </p>
      ) : (
        <ul
          aria-label={'Data room files'}
          className={'flex max-h-56 flex-col overflow-y-auto rounded-md border'}
        >
          {offered.map((each) => (
            <li key={each.id}>
              <button
                type={'button'}
                aria-pressed={document?.id === each.id}
                onClick={() => setDocument(each)}
                className={
                  'hover:bg-muted aria-pressed:bg-primary/10 aria-pressed:text-primary w-full truncate px-3 py-1.5 text-left text-sm'
                }
              >
                {`${each.name} v${each.version}`}
              </button>
            </li>
          ))}
        </ul>
      )}
      {document === null || document.locator === 'document' ? null : (
        <div className={'grid grid-cols-2 gap-3'}>
          <div className={'flex flex-col gap-1'}>
            <Label htmlFor={`${id}-where`}>
              {WHERE_LABEL[document.locator]}
            </Label>
            <Input
              id={`${id}-where`}
              type={document.locator === 'page' ? 'number' : 'text'}
              min={1}
              value={where}
              onChange={(event) => setWhere(event.target.value)}
            />
          </div>
          <div className={'flex flex-col gap-1'}>
            <Label htmlFor={`${id}-cell`}>Cell (optional)</Label>
            <Input
              id={`${id}-cell`}
              placeholder={'B12'}
              value={cell}
              onChange={(event) => setCell(event.target.value)}
            />
          </div>
        </div>
      )}
      <Button
        type={'button'}
        size={'sm'}
        className={'self-end'}
        disabled={props.pending || !ready}
        onClick={() => add(document!)}
      >
        Add source
      </Button>
    </section>
  );
}

export function CitedField(props: {
  sources: CalcSources;
  input: InputRef;
  label: string;
  unsaved?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={'flex flex-col items-start gap-0.5'}>
      <div className={'w-full'}>{props.children}</div>
      <CalcInputSources
        sources={props.sources}
        input={props.input}
        label={props.label}
        unsaved={props.unsaved}
      />
    </div>
  );
}
