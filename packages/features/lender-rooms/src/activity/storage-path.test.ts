import { describe, expect, it } from 'vitest';

import { isOwnDealStoragePath } from './storage-path';

const deal_id = '1e000000-0000-0000-0000-0000000000d1';
const otherDealId = '1e000000-0000-0000-0000-0000000000d2';

describe('isOwnDealStoragePath', () => {
  it('accepts an object under the document deal', () => {
    expect(
      isOwnDealStoragePath({ deal_id, storage_path: `deal/${deal_id}/key-cim.pdf` }),
    ).toBe(true);
  });

  it.each([
    ['another deal', `deal/${otherDealId}/key-cim.pdf`],
    ['a parent segment', `deal/${deal_id}/../${otherDealId}/key-cim.pdf`],
    ['a current segment', `deal/${deal_id}/./key-cim.pdf`],
    ['an empty segment', `deal/${deal_id}//key-cim.pdf`],
    ['a trailing slash', `deal/${deal_id}/`],
    ['a backslash', `deal/${deal_id}/..\\${otherDealId}\\key-cim.pdf`],
    ['a prefix that only resembles the deal', `deal/${deal_id}-x/key-cim.pdf`],
  ])('refuses a path with %s', (_case, storage_path) => {
    expect(isOwnDealStoragePath({ deal_id, storage_path })).toBe(false);
  });
});
