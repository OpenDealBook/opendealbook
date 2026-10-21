import { unzipSync } from 'fflate';
import mammoth from 'mammoth';

import { MAX_INFLATED_BYTES, inflatesBeyond } from '@odb/shared/archive';

const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];
const WORD_DOCUMENT = 'word/document.xml';

function holdsWordDocument(bytes: Uint8Array): boolean {
  if (!ZIP_SIGNATURE.every((byte, index) => bytes[index] === byte)) {
    return false;
  }

  let found = false;
  unzipSync(bytes, {
    filter: (file) => {
      found ||= file.name === WORD_DOCUMENT;
      return false;
    },
  });

  return found;
}

// Versions can come from outside the team, so a file that would inflate past
// the limit is never parsed; it stays downloadable but gets no redline.
export async function docxText(bytes: Uint8Array): Promise<string | null> {
  if (!holdsWordDocument(bytes) || inflatesBeyond(bytes, MAX_INFLATED_BYTES)) {
    return null;
  }

  const { value } = await mammoth.extractRawText({
    buffer: Buffer.from(bytes),
  });

  return value;
}
