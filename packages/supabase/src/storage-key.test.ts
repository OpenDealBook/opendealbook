import { describe, expect, it } from 'vitest';

import { storageKeyName } from './storage-key';

describe('storageKeyName', () => {
  it('keeps ASCII letters, digits, dot, dash, and underscore', () => {
    expect(storageKeyName('Q3_report-v2.final.PDF')).toBe(
      'Q3_report-v2.final.PDF',
    );
  });

  it('turns every other character into an underscore', () => {
    expect(storageKeyName('r\u00e9sum\u00e9 (final)#1%.pdf')).toBe(
      'r_sum___final__1_.pdf',
    );
  });
});
