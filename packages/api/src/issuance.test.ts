import { describe, expect, it } from 'vitest';

import { parseApiKey } from './auth';
import { generateApiKey } from './issuance';

import { createHash } from 'node:crypto';

describe('generateApiKey', () => {
  it('produces a verifiable prefix and hash pair', () => {
    const { rawKey, prefix, hash } = generateApiKey();

    const parsed = parseApiKey(rawKey);

    expect(parsed).not.toBeNull();
    expect(parsed!.prefix).toBe(prefix);

    const expected = `\\x${createHash('sha256')
      .update(parsed!.raw)
      .digest('hex')}`;

    expect(hash).toBe(expected);
  });

  it('produces a unique key each time', () => {
    expect(generateApiKey().rawKey).not.toBe(generateApiKey().rawKey);
  });
});
