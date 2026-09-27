import { afterEach, describe, expect, it } from 'vitest';

import { getEnv, requireEnv } from '../src/env/index';

const KEY = 'TUCKIN_SHARED_ENV_TEST';

afterEach(() => {
  delete process.env[KEY];
});

describe('getEnv', () => {
  it('returns the value when the variable is set', () => {
    process.env[KEY] = 'value';
    expect(getEnv(KEY)).toBe('value');
  });

  it('returns undefined when unset and no fallback is given', () => {
    expect(getEnv(KEY)).toBeUndefined();
  });

  it('returns the fallback when unset', () => {
    expect(getEnv(KEY, 'fallback')).toBe('fallback');
  });
});

describe('requireEnv', () => {
  it('returns the value when the variable is set', () => {
    process.env[KEY] = 'value';
    expect(requireEnv(KEY)).toBe('value');
  });

  it('throws when the variable is missing', () => {
    expect(() => requireEnv(KEY)).toThrow(KEY);
  });
});
