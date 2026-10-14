import { expect, it } from 'vitest';

import { parsePreview } from './parse-preview';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

it('fails loudly, rather than calling the file unsupported, when the PDF engine cannot start', async () => {
  const pdf = Uint8Array.from(
    readFileSync(join(import.meta.dirname, 'fixtures', 'sample.pdf')),
  ).buffer;

  await expect(parsePreview('pdf', pdf)).rejects.toThrow();
});
