import { describe, expect, it } from 'vitest';

import { isBrowser } from '../src/utils/index';

describe('isBrowser', () => {
  it('is false when no window global exists', () => {
    expect(isBrowser()).toBe(false);
  });
});
