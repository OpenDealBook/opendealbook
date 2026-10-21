import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { inflatesBeyond } from '@odb/shared/archive';

import { parsePreview } from './parse-preview';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const archive = zipSync({
  'a.xml': new Uint8Array(1000),
  'b.xml': new Uint8Array(1000),
  'c.xml': new Uint8Array(1000),
});

function fixture(name: string): Uint8Array {
  return readFileSync(join(import.meta.dirname, 'fixtures', name));
}

describe('inflatesBeyond', () => {
  it('is true when the parts inflate to more than the limit', () => {
    expect(inflatesBeyond(archive, 2999)).toBe(true);
  });

  it('is false when the parts inflate to exactly the limit', () => {
    expect(inflatesBeyond(archive, 3000)).toBe(false);
  });

  it('is false for a legacy workbook, which is not an archive', () => {
    expect(inflatesBeyond(fixture('sample.xls'), 0)).toBe(false);
  });

  it('is false for a CSV file, which is not an archive', () => {
    expect(inflatesBeyond(fixture('sample.csv'), 0)).toBe(false);
  });

  it('stops a workbook whose parts inflate past 200 MiB from being previewed', async () => {
    const preview = await parsePreview(
      'sheet',
      Uint8Array.from(fixture('oversized.xlsx')).buffer,
    );

    expect(preview).toEqual({ kind: 'none', reason: 'too-large' });
  }, 30_000);
});
