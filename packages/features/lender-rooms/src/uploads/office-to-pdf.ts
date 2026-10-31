import 'server-only';
import { convertWithGotenberg } from '@odb/shared/gotenberg';

import { contentTypeFor } from './content-type';

export const FILE_EXTENSION = /\.[^.]+$/;

export async function convertOfficeToPdf(
  office: Uint8Array,
  fileName: string,
): Promise<Uint8Array> {
  return convertWithGotenberg(
    '/forms/libreoffice/convert',
    new Blob([Uint8Array.from(office)], { type: contentTypeFor(fileName) }),
    `document${FILE_EXTENSION.exec(fileName)![0].toLowerCase()}`,
  );
}
