import type { PDFDocumentProxy } from 'pdfjs-dist';

import type { ViewerKind } from './viewer-kind';

export type Correspondent = { name: string; address: string };

export type Sheet = {
  name: string;
  rows: string[][];
  clippedRows: boolean;
  clippedColumns: boolean;
};

type EmailBody =
  | { kind: 'html'; srcDoc: string }
  | { kind: 'text'; text: string };

export type UnavailableReason =
  | 'unsupported'
  | 'too-large'
  | 'not-loaded'
  | 'password-protected';

export type Preview =
  | { kind: 'pdf'; document: PDFDocumentProxy }
  | { kind: 'word'; srcDoc: string }
  | { kind: 'sheet'; sheets: Sheet[] }
  | {
      kind: 'email';
      from: Correspondent;
      to: Correspondent[];
      cc: Correspondent[];
      date: string;
      subject: string;
      body: EmailBody;
      attachmentNames: string[];
    }
  | { kind: 'text'; text: string }
  | { kind: 'none'; reason: UnavailableReason };

export type DocumentKind = Exclude<ViewerKind, 'image' | 'none'>;

export const MAX_SHEET_ROWS = 2000;
export const MAX_SHEET_COLUMNS = 50;

const UNSUPPORTED: Preview = { kind: 'none', reason: 'unsupported' };
const TOO_LARGE: Preview = { kind: 'none', reason: 'too-large' };

async function unsupportedIfCorrupt(
  parse: () => Preview | Promise<Preview>,
): Promise<Preview> {
  try {
    return await parse();
  } catch {
    return UNSUPPORTED;
  }
}

async function parsePdf(bytes: ArrayBuffer): Promise<Preview> {
  const { getDocument, GlobalWorkerOptions, version } =
    await import('pdfjs-dist');
  const assets = `/api/pdfjs/${version}`;
  GlobalWorkerOptions.workerSrc = `${assets}/pdf.worker.min.mjs`;
  try {
    const document = await getDocument({
      data: new Uint8Array(bytes),
      cMapUrl: `${assets}/cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${assets}/standard_fonts/`,
      wasmUrl: `${assets}/wasm/`,
      iccUrl: `${assets}/iccs/`,
    }).promise;
    return { kind: 'pdf', document };
  } catch (error) {
    if (!(error instanceof Error) || !error.name.endsWith('Exception')) {
      throw error;
    }
    return error.name === 'PasswordException'
      ? { kind: 'none', reason: 'password-protected' }
      : UNSUPPORTED;
  }
}

const PDF_SIGNATURE = '%PDF-';

async function parseWord(bytes: ArrayBuffer): Promise<Preview> {
  if (
    new TextDecoder().decode(bytes.slice(0, PDF_SIGNATURE.length)) ===
    PDF_SIGNATURE
  ) {
    return parsePdf(bytes);
  }
  const [
    { default: mammoth },
    { inertDocument },
    { inflatesBeyond, MAX_INFLATED_BYTES },
  ] = await Promise.all([
    import('mammoth'),
    import('./untrusted-html'),
    import('@odb/shared/archive'),
  ]);
  return unsupportedIfCorrupt(async () => {
    if (inflatesBeyond(new Uint8Array(bytes), MAX_INFLATED_BYTES)) {
      return TOO_LARGE;
    }
    const { value } = await mammoth.convertToHtml({ arrayBuffer: bytes });
    return { kind: 'word', srcDoc: inertDocument(value) };
  });
}

async function parseSheet(bytes: ArrayBuffer): Promise<Preview> {
  const [{ read, utils, set_cptable }, { inflatesBeyond, MAX_INFLATED_BYTES }] =
    await Promise.all([import('xlsx'), import('@odb/shared/archive')]);
  const signature = new Uint8Array(bytes, 0, Math.min(2, bytes.byteLength));
  const isLegacyOrCsv = !(signature[0] === 0x50 && signature[1] === 0x4b);
  if (isLegacyOrCsv) {
    set_cptable(await import('xlsx/dist/cpexcel.full.mjs'));
  }
  return unsupportedIfCorrupt(() => {
    if (inflatesBeyond(new Uint8Array(bytes), MAX_INFLATED_BYTES)) {
      return TOO_LARGE;
    }
    const workbook = read(bytes, {
      type: 'array',
      ...(isLegacyOrCsv ? { codepage: 65001 } : {}),
    });
    return {
      kind: 'sheet',
      sheets: workbook.SheetNames.map((name) => {
        const sheet = workbook.Sheets[name]!;
        const range = utils.decode_range(sheet['!ref'] ?? 'A1');
        const lastRow = range.s.r + MAX_SHEET_ROWS - 1;
        const lastColumn = range.s.c + MAX_SHEET_COLUMNS - 1;
        const clippedRows = range.e.r > lastRow;
        const clippedColumns = range.e.c > lastColumn;
        sheet['!ref'] = utils.encode_range({
          s: range.s,
          e: {
            r: Math.min(range.e.r, lastRow),
            c: Math.min(range.e.c, lastColumn),
          },
        });
        return {
          name,
          rows: utils.sheet_to_json<string[]>(sheet, {
            header: 1,
            raw: false,
            defval: '',
          }),
          clippedRows,
          clippedColumns,
        };
      }),
    };
  });
}

async function emailBody(
  html: string | undefined,
  text: string | undefined,
): Promise<EmailBody> {
  if (!html) return { kind: 'text', text: text ?? '' };
  const { inertDocument } = await import('./untrusted-html');
  return { kind: 'html', srcDoc: inertDocument(html) };
}

function attachmentName(
  fileName: string | null | undefined,
  contentType: string | undefined,
): string {
  if (fileName) return fileName;
  return contentType?.startsWith('image/') ? 'Inline image' : 'Attachment';
}

async function parseMsg(bytes: ArrayBuffer): Promise<Preview> {
  const [{ default: MsgReader }, { decodeCodePage }] = await Promise.all([
    import('@kenjiuno/msgreader'),
    import('./text-encoding'),
  ]);
  return unsupportedIfCorrupt(async () => {
    const message = new MsgReader(bytes).getFileData();
    if (message.error) throw new Error(message.error);
    const recipients = (type: 'to' | 'cc') =>
      (message.recipients ?? [])
        .filter((recipient) => recipient.recipType === type)
        .map((recipient) => ({
          name: recipient.name ?? '',
          address: recipient.smtpAddress ?? '',
        }));
    return {
      kind: 'email',
      from: {
        name: message.senderName ?? '',
        address: message.senderSmtpAddress ?? '',
      },
      to: recipients('to'),
      cc: recipients('cc'),
      date: message.messageDeliveryTime ?? '',
      subject: message.subject ?? '',
      body: await emailBody(
        message.html &&
          decodeCodePage(
            Uint8Array.from(message.html).buffer,
            message.internetCodepage ?? 65001,
          ),
        message.body,
      ),
      attachmentNames: (message.attachments ?? []).map((attachment) =>
        attachmentName(attachment.fileName, attachment.attachMimeTag),
      ),
    };
  });
}

async function parseEml(bytes: ArrayBuffer): Promise<Preview> {
  const { default: PostalMime } = await import('postal-mime');
  return unsupportedIfCorrupt(async () => {
    const message = await PostalMime.parse(bytes);
    const correspondent = (person: { name: string; address?: string }) => ({
      name: person.name,
      address: person.address ?? '',
    });
    const received = new Date(message.date ?? '');
    return {
      kind: 'email',
      from: {
        name: message.from?.name ?? '',
        address: message.from?.address ?? '',
      },
      to: (message.to ?? []).map(correspondent),
      cc: (message.cc ?? []).map(correspondent),
      date: Number.isNaN(received.getTime()) ? '' : received.toUTCString(),
      subject: message.subject ?? '',
      body: await emailBody(message.html, message.text),
      attachmentNames: message.attachments.map((attachment) =>
        attachmentName(attachment.filename, attachment.mimeType),
      ),
    };
  });
}

async function parseText(bytes: ArrayBuffer): Promise<Preview> {
  const { decodeText } = await import('./text-encoding');
  return { kind: 'text', text: decodeText(bytes) };
}

const PARSERS: Record<DocumentKind, (bytes: ArrayBuffer) => Promise<Preview>> =
  {
    pdf: parsePdf,
    word: parseWord,
    sheet: parseSheet,
    msg: parseMsg,
    eml: parseEml,
    text: parseText,
  };

export function parsePreview(
  kind: DocumentKind,
  bytes: ArrayBuffer,
): Promise<Preview> {
  return PARSERS[kind](bytes);
}
