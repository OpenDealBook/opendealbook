import { describe, expect, it } from 'vitest';

import { parseCsl } from './csl';

import { readFileSync } from 'node:fs';

const fixture = readFileSync(
  new URL('./fixtures/consolidated.json', import.meta.url),
  'utf8',
);

describe('parseCsl', () => {
  it('stamps the snapshot with the time trade.gov built it', () => {
    expect(parseCsl(fixture).asOf).toBe('2026-10-27T11:15:00.018748+00:00');
  });

  it('turns each list entry into a screening entry dated by its own list', () => {
    const { entries } = parseCsl(fixture);

    expect(entries[0]).toEqual({
      list_name: 'Capta List (CAP) - Treasury Department',
      source_entry_id: '15268',
      name: 'BANK OF KUNLUN CO LTD',
      alt_names: [
        'KARAMAY URBAN CREDIT COOPERATIVES',
        'KARAMAY CITY COMMERCIAL BANK CO LTD.',
      ],
      entry_type: 'entity',
      programs: ['561-Related'],
      addresses: expect.arrayContaining([
        expect.objectContaining({ city: 'Beijing', country: 'CN' }),
      ]),
      countries: ['CN'],
      source_url: 'https://sanctionslist.ofac.treas.gov/Home/ConsolidatedList',
      as_of: '2026-10-21T16:35:23+00:00',
      raw: JSON.parse(fixture).results[0],
    });
  });

  it('rejects a file whose entries do not have the published shape', () => {
    const file = JSON.parse(fixture);
    delete file.results[0].name;

    expect(() => parseCsl(JSON.stringify(file))).toThrow(/name/);
  });

  it('rejects a file with no entries', () => {
    const file = { ...JSON.parse(fixture), results: [] };

    expect(() => parseCsl(JSON.stringify(file))).toThrow(
      'The sanctions list file had no entries',
    );
  });

  it('keeps an entity listed by two lists as one entry per list', () => {
    const { entries } = parseCsl(fixture);

    expect(
      entries
        .filter((entry) => entry.source_entry_id === '17014')
        .map((entry) => entry.list_name),
    ).toEqual([
      'Non-SDN Menu-Based Sanctions List (NS-MBS List) - Treasury Department',
      'Sectoral Sanctions Identifications List (SSI) - Treasury Department',
    ]);
  });

  it('reads an untyped list entry without names or programs as empty', () => {
    const huawei = parseCsl(fixture).entries.find((entry) =>
      entry.list_name.startsWith('Entity List'),
    );

    expect(huawei).toMatchObject({
      entry_type: null,
      alt_names: [],
      programs: [],
      countries: ['HK', 'CN'],
      as_of: '2026-08-21T20:19:33+00:00',
    });
  });
});
