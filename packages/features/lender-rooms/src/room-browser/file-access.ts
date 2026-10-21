import type { RoomEntry, RoomFile } from '../contents/listing';

export type RoomSpace = { roomId: string } | { sellerRoomId: string };

export type FileSource = RoomSpace | { accountSlug: string; dealId: string };

function roomFiles(space: RoomSpace): string {
  return 'roomId' in space
    ? `/lender/${space.roomId}/files`
    : `/seller/rooms/${space.sellerRoomId}/files`;
}

export function fileUrl(
  file: FileSource & {
    documentId: string;
    disposition: 'preview' | 'download';
  },
): string {
  const files =
    'accountSlug' in file
      ? `/home/${file.accountSlug}/deals/${file.dealId}/lenders/package/files`
      : roomFiles(file);

  return `${files}/${file.documentId}?disposition=${file.disposition}`;
}

export function zipDownloadForm(
  space: RoomSpace,
  documentIds: string[],
): { action: string; fields: { name: 'documentIds'; value: string }[] } {
  return {
    action: `${roomFiles(space)}/zip`,
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
