import { afterEach, describe, expect, it, vi } from 'vitest';

import { discoverLeadFiles } from './activities';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('discoverLeadFiles', () => {
  it('fails only the registry file whose HEAD fails or whose date is malformed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('data.ny.gov')) return { ok: false, status: 503 };
        if (url.includes('data.pa.gov'))
          return {
            ok: true,
            headers: new Headers({ 'last-modified': 'not a date' }),
          };
        if (url.endsWith('/datasets/554/')) {
          return {
            ok: true,
            json: async () => ({
              data: { lastUpdated: '2026-10-23T10:26:00-05:00' },
            }),
          };
        }
        return {
          ok: true,
          headers: new Headers({
            'last-modified': 'Sun, 25 Oct 2026 11:28:27 GMT',
          }),
        };
      }),
    );

    const files = await discoverLeadFiles('state_registry');

    expect(
      files.map((file) => [
        ('state' in file && file.state) || file.url,
        'failure' in file ? file.failure : file.asOf,
      ]),
    ).toEqual([
      [
        'NY',
        'HEAD https://data.ny.gov/api/views/n9v6-gdp6/rows.csv?accessType=DOWNLOAD answered 503',
      ],
      ['CO', '2026-10-25'],
      ['PA', 'Last-Modified is not a date: not a date'],
      ['CT', '2026-10-25'],
      ['TX', '2026-10-25'],
      ['IA', '2026-10-23'],
      ['DC', '2026-10-25'],
    ]);
  });
});
