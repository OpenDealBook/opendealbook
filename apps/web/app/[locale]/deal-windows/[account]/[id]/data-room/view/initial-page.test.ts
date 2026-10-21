import { describe, expect, it } from 'vitest';

import { initialPage } from './initial-page';

describe('initialPage', () => {
  it.each([
    ['3', 3],
    [undefined, 1],
    ['', 1],
    ['abc', 1],
    ['0', 1],
    ['-4', 1],
    ['2.5', 1],
  ])('opens %j at page %i', (param, page) => {
    expect(initialPage(param)).toBe(page);
  });
});
