import { describe, expect, it } from 'vitest';

import { parseDealParams, viewToSearchParams } from './deals-search-params';

describe('examples search param', () => {
  it('parses the Examples filter and keeps it in a saved view', () => {
    const { filters } = parseDealParams({ examples: '1' });

    expect(filters.examples).toBe(true);
    expect(viewToSearchParams({ filters }).get('examples')).toBe('1');
  });
});
