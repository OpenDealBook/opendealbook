import type { DoclingDocument, DoclingPass } from './docling';
import { type PageText, pageSegments, SEGMENT_MAX_CHARS } from './doclingPages';
import { type SheetBlock, sheetBlocks } from './sheets';

const FORMATS = {
  pdf: 'pdf',
  docx: 'office',
  doc: 'office',
  pptx: 'office',
  ppt: 'office',
  xlsx: 'xlsx',
  xls: 'xls',
  csv: 'csv',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  tif: 'image',
  tiff: 'image',
  txt: 'text',
  md: 'text',
} as const;

export type IngestibleFormat = (typeof FORMATS)[keyof typeof FORMATS];

export type SegmentDraft =
  | (PageText & { kind: 'page'; from_ocr: boolean })
  | (SheetBlock & { from_ocr: false });

export interface ExtractionTools {
  convert: (
    bytes: Uint8Array,
    fileName: string,
    pass: DoclingPass,
  ) => Promise<DoclingDocument>;
  toPdf: (bytes: Uint8Array, fileName: string) => Promise<Uint8Array>;
}

export function ingestibleFormat(name: string): IngestibleFormat | null {
  const extension = /\.([^.]+)$/.exec(name)?.[1]?.toLowerCase() ?? '';
  return Object.hasOwn(FORMATS, extension)
    ? FORMATS[extension as keyof typeof FORMATS]
    : null;
}

export async function extractSegments(
  file: { name: string; bytes: Uint8Array; format: IngestibleFormat },
  tools: ExtractionTools,
  forceOcr: boolean,
): Promise<SegmentDraft[]> {
  switch (file.format) {
    case 'pdf':
      return pdfSegments(file.bytes, file.name, tools, forceOcr);
    case 'office':
      return pdfSegments(
        await tools.toPdf(file.bytes, file.name),
        file.name.replace(/\.[^.]+$/, '.pdf'),
        tools,
        forceOcr,
      );
    case 'image':
      return pageSegments(
        await tools.convert(file.bytes, file.name, { ocr: 'force' }),
      ).map((page) => ({ kind: 'page', ...page, from_ocr: true }));
    case 'text':
      return textPages(new TextDecoder().decode(file.bytes)).map(
        (text, index) => ({
          kind: 'page',
          page_from: index + 1,
          page_to: index + 1,
          text,
          from_ocr: false,
        }),
      );
    case 'xlsx':
    case 'xls':
    case 'csv':
      return sheetBlocks(file.bytes, file.format).map((block) => ({
        ...block,
        from_ocr: false as const,
      }));
  }
}

function textPages(text: string): string[] {
  const pages: string[] = [];
  let current: string | null = null;
  for (const line of text.split('\n').flatMap(cutToPage)) {
    if (
      current !== null &&
      current.length + 1 + line.length <= SEGMENT_MAX_CHARS
    ) {
      current = `${current}\n${line}`;
    } else {
      if (current !== null) {
        pages.push(current);
      }
      current = line;
    }
  }
  if (current?.trim()) {
    pages.push(current);
  }
  return pages;
}

function cutToPage(line: string): string[] {
  return Array.from(
    { length: Math.max(1, Math.ceil(line.length / SEGMENT_MAX_CHARS)) },
    (_, index) =>
      line.slice(index * SEGMENT_MAX_CHARS, (index + 1) * SEGMENT_MAX_CHARS),
  );
}

async function pdfSegments(
  bytes: Uint8Array,
  fileName: string,
  tools: ExtractionTools,
  forceOcr: boolean,
): Promise<SegmentDraft[]> {
  const pass = async (docling: DoclingPass, fromOcr: boolean) => {
    const document = await tools.convert(bytes, fileName, docling);
    return {
      document,
      segments: pageSegments(document).map((page) => ({
        kind: 'page' as const,
        ...page,
        from_ocr: fromOcr,
      })),
    };
  };

  if (forceOcr) {
    return (await pass({ ocr: 'force' }, true)).segments;
  }

  const textLayer = await pass({ ocr: 'none' }, false);
  const ocred = [];
  for (const pages of runsOfPagesWithoutText(
    textLayer.document,
    textLayer.segments,
  )) {
    ocred.push(...(await pass({ ocr: 'force', pages }, true)).segments);
  }

  return [...textLayer.segments, ...ocred].sort(
    (a, b) => a.page_from - b.page_from,
  );
}

function runsOfPagesWithoutText(
  document: DoclingDocument,
  segments: PageText[],
): [number, number][] {
  const covered = (page: number) =>
    segments.some(
      (segment) => segment.page_from <= page && page <= segment.page_to,
    );
  const empty = Object.values(document.pages)
    .map((page) => page.page_no)
    .filter((page) => !covered(page))
    .sort((a, b) => a - b);

  const runs: [number, number][] = [];
  for (const page of empty) {
    const last = runs.at(-1);
    if (last && last[1] === page - 1) {
      last[1] = page;
    } else {
      runs.push([page, page]);
    }
  }
  return runs;
}
