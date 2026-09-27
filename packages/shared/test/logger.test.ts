import { describe, expect, it } from 'vitest';

import { getLogger } from '../src/logger/index';

describe('getLogger', () => {
  it('returns a logger exposing the standard level methods', () => {
    const logger = getLogger();

    for (const level of ['info', 'error', 'warn', 'debug', 'fatal']) {
      expect(typeof logger[level as keyof typeof logger]).toBe('function');
    }
  });

  it('returns the same singleton instance on repeated calls', () => {
    expect(getLogger()).toBe(getLogger());
  });
});
