import { unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { MAX_INFLATED_BYTES } from '@odb/shared/archive';

import { docxText } from './docx-text';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const apaShort = new Uint8Array(
  readFileSync(
    join(import.meta.dirname, '../../../templates/fixtures/apa-short.docx'),
  ),
);

describe('docxText', () => {
  it('reads the words of a Word document', async () => {
    expect(await docxText(apaShort)).toContain(
      'This Asset Purchase Agreement is entered into as of',
    );
  });

  it('reads nothing from a document that inflates past the limit', async () => {
    const oversized = zipSync({
      ...unzipSync(apaShort),
      'word/media/padding.bin': new Uint8Array(MAX_INFLATED_BYTES + 1),
    });

    expect(await docxText(oversized)).toBeNull();
  }, 60_000);

  it('reads nothing from a file that is not a zip', async () => {
    expect(await docxText(new TextEncoder().encode('not a word file'))).toBeNull();
  });

  it('reads nothing from a zip that holds no Word document', async () => {
    expect(
      await docxText(zipSync({ 'sheet.xml': new Uint8Array(10) })),
    ).toBeNull();
  });

  it('fails on a Word document whose text cannot be read', async () => {
    await expect(
      docxText(
        zipSync({
          'word/document.xml': new TextEncoder().encode('<w:document'),
          '[Content_Types].xml': new Uint8Array(0),
        }),
      ),
    ).rejects.toThrow();
  });
});
