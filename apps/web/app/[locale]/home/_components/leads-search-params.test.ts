import { expect, it } from 'vitest';

import { parseLeadParams } from './leads-search-params';

it('keeps known filters, the search text and the page', () => {
  expect(
    parseLeadParams({
      verdict: 'not_fit',
      source: 'sba_504',
      state: 'TX',
      q: 'acme',
      page: '3',
    }),
  ).toEqual({
    filters: { verdict: 'not_fit', source: 'sba_504', state: 'TX', q: 'acme' },
    page: 3,
  });
});

it('ignores an unknown verdict or source, as the deals list ignores unknown params', () => {
  expect(
    parseLeadParams({ verdict: 'maybe', source: 'yelp', state: 'TX' }).filters,
  ).toEqual({ verdict: '', source: '', state: 'TX', q: '' });
});

it('falls back to the first page when the page is not a positive whole number', () => {
  expect(parseLeadParams({ page: 'two' }).page).toBe(1);
  expect(parseLeadParams({ page: '0' }).page).toBe(1);
  expect(parseLeadParams({ page: '1.5' }).page).toBe(1);
});

it('reads the first value of a repeated param', () => {
  expect(parseLeadParams({ verdict: ['fit', 'not_fit'] }).filters.verdict).toBe(
    'fit',
  );
});
