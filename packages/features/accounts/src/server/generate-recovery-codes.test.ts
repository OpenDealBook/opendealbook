import { describe, expect, it } from 'vitest';

import {
  generateRecoveryCodes,
  normalizeRecoveryCode,
} from './generate-recovery-codes';

const NORMALIZED_CODE = /^[2-9A-HJKMNP-TV-Z]{10}$/;

describe('generateRecoveryCodes', () => {
  it('returns ten codes by default', () => {
    expect(generateRecoveryCodes()).toHaveLength(10);
  });

  it('returns the requested number of codes', () => {
    expect(generateRecoveryCodes(3)).toHaveLength(3);
  });

  it('draws every symbol from the unambiguous alphabet at a fixed length', () => {
    for (const code of generateRecoveryCodes()) {
      expect(normalizeRecoveryCode(code)).toMatch(NORMALIZED_CODE);
    }
  });

  it('does not repeat a code within a batch', () => {
    const codes = generateRecoveryCodes(50);

    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('normalizeRecoveryCode', () => {
  it('strips whitespace and dashes and upper-cases', () => {
    expect(normalizeRecoveryCode('  ab-cd 2h-jk3  ')).toBe('ABCD2HJK3');
  });
});
