import { describe, expect, it, vi } from 'vitest';

import {
  asOfFromLastModified,
  download,
  form5500Files,
  pppFiles,
  sbaFiles,
} from './discover';

import { readFileSync } from 'node:fs';

const page = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

describe('lead file discovery', () => {
  it('lists every PPP csv with the as-of date its filename carries', () => {
    expect(pppFiles(page('ppp-dataset-page.html'))).toEqual([
      {
        kind: 'ppp',
        url: 'https://data.sba.gov/sites/default/files/distribution/SBA-OCA-2022-07-001/public_150k_plus_240930.csv',
        asOf: '2024-09-30',
      },
      {
        kind: 'ppp',
        url: 'https://data.sba.gov/sites/default/files/distribution/SBA-OCA-2022-07-001/public_up_to_150k_1_240930.csv',
        asOf: '2024-09-30',
      },
    ]);
  });

  it('splits the SBA FOIA files into 7(a) and 504', () => {
    expect(sbaFiles(page('sba-dataset-page.html'))).toEqual([
      {
        kind: 'sba_504',
        url: 'https://data.sba.gov/sites/default/files/uploaded_resources/FOIA_504_FY2010_Present_asof_260630.csv',
        asOf: '2026-06-30',
      },
      {
        kind: 'sba_7a',
        url: 'https://data.sba.gov/sites/default/files/uploaded_resources/FOIA_7a_FY2020_Present_asof_260630.csv',
        asOf: '2026-06-30',
      },
    ]);
  });

  it('names the 5500 and 5500-SF latest files for the three plan years before this one', () => {
    expect(
      form5500Files(new Date('2026-10-26T00:00:00Z')).map((file) => [
        file.kind,
        file.url,
      ]),
    ).toEqual([
      [
        'form_5500',
        'https://www.askebsa.dol.gov/FOIA%20Files/2025/Latest/F_5500_2025_Latest.zip',
      ],
      [
        'form_5500_sf',
        'https://www.askebsa.dol.gov/FOIA%20Files/2025/Latest/F_5500_SF_2025_Latest.zip',
      ],
      [
        'form_5500',
        'https://www.askebsa.dol.gov/FOIA%20Files/2024/Latest/F_5500_2024_Latest.zip',
      ],
      [
        'form_5500_sf',
        'https://www.askebsa.dol.gov/FOIA%20Files/2024/Latest/F_5500_SF_2024_Latest.zip',
      ],
      [
        'form_5500',
        'https://www.askebsa.dol.gov/FOIA%20Files/2023/Latest/F_5500_2023_Latest.zip',
      ],
      [
        'form_5500_sf',
        'https://www.askebsa.dol.gov/FOIA%20Files/2023/Latest/F_5500_SF_2023_Latest.zip',
      ],
    ]);
  });

  it('refuses a response that is not ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 503 })),
    );

    await expect(download('https://sba.test/page')).rejects.toThrow(
      'GET https://sba.test/page answered 503',
    );

    vi.unstubAllGlobals();
  });

  it('dates a file by its Last-Modified header', () => {
    expect(
      asOfFromLastModified(
        'Wed, 30 Sep 2026 16:19:00 GMT',
        new Date('2026-10-26T03:00:00Z'),
      ),
    ).toBe('2026-09-30');
  });

  it("dates a file with no Last-Modified header by today's UTC date", () => {
    expect(asOfFromLastModified(null, new Date('2026-10-26T03:00:00Z'))).toBe(
      '2026-10-26',
    );
  });
});
