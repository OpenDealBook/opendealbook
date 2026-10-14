import type { RoomEntry, RoomFile } from '../contents/listing';

export type FileSource =
  | { roomId: string }
  | { accountSlug: string; dealId: string };

export function fileUrl(
  file: FileSource & {
    documentId: string;
    disposition: 'preview' | 'download';
  },
): string {
  const files =
    'roomId' in file
      ? `/lender/${file.roomId}/files`
      : `/home/${file.accountSlug}/deals/${file.dealId}/lenders/package/files`;

  return `${files}/${file.documentId}?disposition=${file.disposition}`;
}

export function zipDownloadForm(
  roomId: string,
  documentIds: string[],
): { action: string; fields: { name: 'documentIds'; value: string }[] } {
  return {
    action: `/lender/${roomId}/files/zip`,
    fields: documentIds.map((value) => ({ name: 'documentIds', value })),
  };
}

export function neighbours(
  entries: RoomEntry[],
  documentId: string,
): { previous: RoomFile | null; next: RoomFile | null } {
  const files = entries.filter((entry) => entry.kind === 'file');
  const position = files.findIndex((file) => file.documentId === documentId);

  return {
    previous: files[position - 1] ?? null,
    next: files[position + 1] ?? null,
  };
}

const MIB = 1024 * 1024;
const GIB = 1024 * MIB;

export function fileSize(bytes: number): string {
  const [amount, unit] =
    bytes >= GIB ? [bytes / GIB, 'GiB'] : [bytes / MIB, 'MiB'];

  return `${Number(amount.toFixed(1))} ${unit}`;
}
