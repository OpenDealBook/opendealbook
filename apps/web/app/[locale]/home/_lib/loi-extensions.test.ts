import { describe, expect, it } from 'vitest';

import { extensionState } from './loi-extensions';

describe('extensionState', () => {
  const open = { signed: false, noted_on: null, signing_status: null };

  it('is a draft until it is sent, signed, or noted', () => {
    expect(extensionState(open)).toBe('draft');
  });

  it('is out for signature while the version that counts is with Documenso', () => {
    for (const status of ['draft', 'sent', 'completed']) {
      expect(extensionState({ ...open, signing_status: status })).toBe('out');
    }
  });

  it('is noted once agreed without a signed copy', () => {
    expect(extensionState({ ...open, noted_on: '2026-11-20' })).toBe('noted');
  });

  it('is signed once a version is signed, even after it was noted or while Documenso still shows it', () => {
    expect(
      extensionState({ ...open, signed: true, noted_on: '2026-11-20' }),
    ).toBe('signed');
    expect(
      extensionState({ ...open, signed: true, signing_status: 'completed' }),
    ).toBe('signed');
  });
});
