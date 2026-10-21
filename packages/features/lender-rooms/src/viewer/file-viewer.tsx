'use client';

import { Component, type ReactNode, useEffect, useRef, useState } from 'react';

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  FileQuestionIcon,
  PaperclipIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';

import { Button } from '@odb/ui/button';
import { Spinner } from '@odb/ui/spinner';
import { Table, TableBody, TableCell, TableRow } from '@odb/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@odb/ui/tabs';

import { holdPreview } from './load-preview';
import {
  type Correspondent,
  type DocumentKind,
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  type Preview,
  type Sheet,
  type UnavailableReason,
} from './parse-preview';
import { fitZoom, pageAfter, pageBefore, zoomIn, zoomOut } from './pdf-zoom';
import { viewerKind } from './viewer-kind';

export type FileViewerProps = {
  fileName: string;
  previewUrl: string;
  downloadUrl: string;
  initialPage?: number;
  initialSheet?: string;
};

export function FileViewer({
  fileName,
  previewUrl,
  downloadUrl,
  initialPage,
  initialSheet,
}: FileViewerProps) {
  const kind = viewerKind(fileName);

  return (
    <section className="bg-muted/50 flex h-full min-h-0 flex-col">
      <header className="bg-background flex shrink-0 items-center gap-3 border-b px-4 py-2">
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium">
          {fileName}
        </h2>
        <Button asChild variant="outline" size="sm">
          <a href={downloadUrl}>
            <DownloadIcon aria-hidden />
            Download
          </a>
        </Button>
      </header>
      <div className="relative min-h-0 flex-1">
        {kind === 'none' ? (
          <NoPreview reason="unsupported" />
        ) : kind === 'image' ? (
          <ImagePreview key={previewUrl} fileName={fileName} src={previewUrl} />
        ) : (
          <LoadFailureBoundary key={previewUrl}>
            <DocumentPreview
              kind={kind}
              fileName={fileName}
              previewUrl={previewUrl}
              initialPage={initialPage}
              initialSheet={initialSheet}
            />
          </LoadFailureBoundary>
        )}
      </div>
    </section>
  );
}

const UNAVAILABLE_MESSAGES: Record<UnavailableReason, string> = {
  unsupported: 'Preview is not available for this file type',
  'too-large': 'This file is too large to preview',
  'not-loaded': 'This file could not be loaded. Reload the page and try again.',
  'password-protected':
    'This PDF is password protected. Download it to open it.',
};

function NoPreview({ reason }: { reason: UnavailableReason }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <FileQuestionIcon
        aria-hidden
        className="text-muted-foreground size-10 stroke-[1.25]"
      />
      <p className="text-sm font-medium">{UNAVAILABLE_MESSAGES[reason]}</p>
      {reason === 'unsupported' || reason === 'too-large' ? (
        <p className="text-muted-foreground text-sm">
          Download the file to open it on your device.
        </p>
      ) : null}
    </div>
  );
}

class LoadFailureBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: unknown) {
    console.error(error);
  }

  override render() {
    return this.state.failed ? (
      <NoPreview reason="not-loaded" />
    ) : (
      this.props.children
    );
  }
}

function ImagePreview({ fileName, src }: { fileName: string; src: string }) {
  const [failed, setFailed] = useState(false);

  return failed ? (
    <NoPreview reason="unsupported" />
  ) : (
    <div className="flex h-full items-center justify-center p-6">
      <img
        src={src}
        alt={fileName}
        onError={() => setFailed(true)}
        className="max-h-full max-w-full object-contain shadow-md"
      />
    </div>
  );
}

type LoadState =
  | { status: 'loading' }
  | { status: 'loaded'; preview: Preview }
  | { status: 'failed'; error: unknown };

function DocumentPreview({
  kind,
  fileName,
  previewUrl,
  initialPage,
  initialSheet,
}: {
  kind: DocumentKind;
  fileName: string;
  previewUrl: string;
  initialPage: number | undefined;
  initialSheet: string | undefined;
}) {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let shown = true;
    const { loading, release } = holdPreview(kind, previewUrl);
    void loading.then(
      (preview) => shown && setLoad({ status: 'loaded', preview }),
      (error: unknown) => shown && setLoad({ status: 'failed', error }),
    );
    return () => {
      shown = false;
      release();
    };
  }, [kind, previewUrl]);

  if (load.status === 'failed') throw load.error;

  if (load.status === 'loading') {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="text-muted-foreground size-6" />
      </div>
    );
  }

  const { preview } = load;
  switch (preview.kind) {
    case 'pdf':
      return <PdfPreview pdf={preview.document} initialPage={initialPage} />;
    case 'word':
      return <InertFrame title={fileName} srcDoc={preview.srcDoc} />;
    case 'sheet':
      return (
        <SheetPreview sheets={preview.sheets} initialSheet={initialSheet} />
      );
    case 'email':
      return <EmailPreview fileName={fileName} email={preview} />;
    case 'text':
      return (
        <pre className="bg-background h-full overflow-auto p-6 font-mono text-sm leading-relaxed whitespace-pre-wrap">
          {preview.text}
        </pre>
      );
    case 'none':
      return <NoPreview reason={preview.reason} />;
  }
}

function InertFrame({ title, srcDoc }: { title: string; srcDoc: string }) {
  return (
    <iframe
      title={title}
      sandbox=""
      srcDoc={srcDoc}
      className="size-full border-0"
    />
  );
}

const CSS_PIXELS_PER_POINT = 96 / 72;

function PdfPreview({
  pdf,
  initialPage,
}: {
  pdf: PDFDocumentProxy;
  initialPage: number | undefined;
}) {
  const [pageNumber, setPageNumber] = useState(
    Math.min(initialPage ?? 1, pdf.numPages),
  );
  const [zoom, setZoom] = useState<number | null>(null);
  const [zoomedByHand, setZoomedByHand] = useState(false);
  const [fitScale, setFitScale] = useState(1);
  const paneRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (zoomedByHand) return;
    const pane = paneRef.current!;
    const observer = new ResizeObserver(() => {
      void pdf.getPage(pageNumber).then((page) => {
        const fit = fitZoom(
          pane.clientWidth,
          page.getViewport({ scale: 1 }).width,
        );
        setFitScale(fit);
        setZoom(fit);
      });
    });
    observer.observe(pane);
    return () => observer.disconnect();
  }, [pdf, pageNumber, zoomedByHand]);

  useEffect(() => {
    if (zoom === null) return;
    let mounted = true;
    void (async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        if (!mounted) return;
        const viewport = page.getViewport({
          scale: zoom * CSS_PIXELS_PER_POINT * window.devicePixelRatio,
        });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${viewport.width / window.devicePixelRatio}px`;
        canvas.className = 'bg-white shadow-md';
        await page.render({ canvas, viewport }).promise;
        if (mounted) pageRef.current!.replaceChildren(canvas);
      } catch {
        if (mounted) setFailed(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [pdf, pageNumber, zoom]);

  if (failed) return <NoPreview reason="unsupported" />;

  return (
    <>
      <div ref={paneRef} className="h-full overflow-auto">
        <div
          ref={pageRef}
          className="flex min-w-fit justify-center p-6 pb-20"
        />
      </div>
      {zoom === null ? null : (
        <div className="bg-background absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border px-2 py-1 shadow-lg">
          <Button
            variant="ghost"
            size="icon"
            className="size-8 rounded-full"
            aria-label="Previous page"
            disabled={pageBefore(pageNumber) === pageNumber}
            onClick={() => setPageNumber(pageBefore(pageNumber))}
          >
            <ChevronLeftIcon aria-hidden />
          </Button>
          <span className="px-1 text-sm tabular-nums">
            Page {pageNumber} of {pdf.numPages}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 rounded-full"
            aria-label="Next page"
            disabled={pageAfter(pageNumber, pdf.numPages) === pageNumber}
            onClick={() => setPageNumber(pageAfter(pageNumber, pdf.numPages))}
          >
            <ChevronRightIcon aria-hidden />
          </Button>
          <span aria-hidden className="bg-border mx-1 h-5 w-px" />
          <Button
            variant="ghost"
            size="icon"
            className="size-8 rounded-full"
            aria-label="Zoom out"
            disabled={zoomOut(zoom, fitScale) === zoom}
            onClick={() => {
              setZoomedByHand(true);
              setZoom(zoomOut(zoom, fitScale));
            }}
          >
            <ZoomOutIcon aria-hidden />
          </Button>
          <span className="w-12 text-center text-sm tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 rounded-full"
            aria-label="Zoom in"
            disabled={zoomIn(zoom) === zoom}
            onClick={() => {
              setZoomedByHand(true);
              setZoom(zoomIn(zoom));
            }}
          >
            <ZoomInIcon aria-hidden />
          </Button>
        </div>
      )}
    </>
  );
}

function clippingNotice(sheet: Sheet): string | null {
  const rows = `${MAX_SHEET_ROWS.toLocaleString('en-US')} rows`;
  const columns = `${MAX_SHEET_COLUMNS} columns`;
  if (sheet.clippedRows && sheet.clippedColumns) {
    return `Showing the first ${rows} and ${columns}`;
  }
  if (sheet.clippedRows) return `Showing the first ${rows}`;
  if (sheet.clippedColumns) return `Showing the first ${columns}`;
  return null;
}

function SheetPreview({
  sheets,
  initialSheet,
}: {
  sheets: Sheet[];
  initialSheet: string | undefined;
}) {
  const opening =
    sheets.find((sheet) => sheet.name === initialSheet) ?? sheets[0]!;

  return (
    <Tabs defaultValue={opening.name} className="h-full gap-0">
      {sheets.map((sheet) => (
        <TabsContent
          key={sheet.name}
          value={sheet.name}
          className="bg-background flex min-h-0 flex-col"
        >
          {clippingNotice(sheet) === null ? null : (
            <p className="bg-muted text-muted-foreground shrink-0 border-b px-4 py-1.5 text-xs">
              {clippingNotice(sheet)}
            </p>
          )}
          <div className="min-h-0 flex-1 overflow-auto">
            <Table className="w-auto border-separate border-spacing-0">
              <TableBody>
                {sheet.rows.map((row, rowIndex) => (
                  <TableRow key={rowIndex} className="hover:bg-transparent">
                    <TableCell className="bg-muted text-muted-foreground sticky left-0 w-10 border-r border-b px-2 py-1 text-right text-xs tabular-nums select-none">
                      {rowIndex + 1}
                    </TableCell>
                    {row.map((cell, columnIndex) => (
                      <TableCell
                        key={columnIndex}
                        className="border-r border-b px-3 py-1 whitespace-nowrap tabular-nums"
                      >
                        {cell}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      ))}
      <div className="bg-muted shrink-0 overflow-x-auto border-t px-2 py-1">
        <TabsList className="h-8">
          {sheets.map((sheet) => (
            <TabsTrigger key={sheet.name} value={sheet.name} className="px-3">
              {sheet.name}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
    </Tabs>
  );
}

function CorrespondentList({ people }: { people: Correspondent[] }) {
  return people.map((person, index) => (
    <span key={index} className="mr-3 inline-block">
      {person.name}
      {person.address ? (
        <span className="text-muted-foreground"> {person.address}</span>
      ) : null}
    </span>
  ));
}

function EmailPreview({
  fileName,
  email,
}: {
  fileName: string;
  email: Extract<Preview, { kind: 'email' }>;
}) {
  return (
    <div className="bg-background mx-auto flex h-full max-w-4xl flex-col">
      <div className="shrink-0 space-y-3 border-b px-6 py-5">
        <h3 className="text-lg leading-snug font-semibold">{email.subject}</h3>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">From</dt>
          <dd>
            <CorrespondentList people={[email.from]} />
          </dd>
          <dt className="text-muted-foreground">To</dt>
          <dd>
            <CorrespondentList people={email.to} />
          </dd>
          {email.cc.length > 0 ? (
            <>
              <dt className="text-muted-foreground">Cc</dt>
              <dd>
                <CorrespondentList people={email.cc} />
              </dd>
            </>
          ) : null}
          <dt className="text-muted-foreground">Date</dt>
          <dd>{email.date}</dd>
        </dl>
        <ul className="flex flex-wrap gap-2">
          {email.attachmentNames.map((name, index) => (
            <li
              key={index}
              className="bg-muted flex items-center gap-1.5 rounded-md px-2 py-1 text-xs"
            >
              <PaperclipIcon aria-hidden className="size-3" />
              {name}
            </li>
          ))}
        </ul>
      </div>
      <div className="min-h-0 flex-1">
        {email.body.kind === 'html' ? (
          <InertFrame title={fileName} srcDoc={email.body.srcDoc} />
        ) : (
          <p className="h-full overflow-auto px-6 py-5 text-sm leading-relaxed whitespace-pre-wrap">
            {email.body.text}
          </p>
        )}
      </div>
    </div>
  );
}
