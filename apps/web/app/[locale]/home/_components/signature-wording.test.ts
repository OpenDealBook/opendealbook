import { describe, expect, it } from 'vitest';

import { contractSignatures, signatureInProgress } from './signature-wording';

describe('contract signatures as the offer shows them', () => {
  it('keeps a known signing status', () => {
    expect(
      contractSignatures({
        loi: {
          contractVersionId: 'v1',
          signingStatus: 'sent',
          editorUrl: null,
        },
        apa: null,
        canGenerate: { loi: false, apa: true },
      }),
    ).toEqual({
      loi: { contractVersionId: 'v1', signingStatus: 'sent', editorUrl: null },
      apa: null,
      canGenerate: { loi: false, apa: true },
    });
  });

  it('refuses to show a signing status it has no words for', () => {
    expect(() =>
      contractSignatures({
        loi: null,
        canGenerate: { loi: true, apa: true },
        apa: {
          contractVersionId: 'v2',
          signingStatus: 'voided',
          editorUrl: null,
        },
      }),
    ).toThrow();
  });
});

describe('a signature request in progress', () => {
  it.each([
    ['draft', true],
    ['sent', true],
    ['completed', false],
    ['declined', false],
    ['expired', false],
    ['cancelled', false],
    [null, false],
  ] as const)('%s: %s', (status, expected) => {
    expect(signatureInProgress(status)).toBe(expected);
  });
});
