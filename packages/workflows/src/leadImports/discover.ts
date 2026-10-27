import type { LeadFile, LeadFileRef } from './files';

export const PPP_DATASET_PAGE = 'https://data.sba.gov/dataset/ppp-foia';
const SBA_DATASET_PAGE = 'https://data.sba.gov/dataset/7a-504-foia';

export async function download(
  url: string,
  method: 'GET' | 'HEAD' = 'GET',
): Promise<Response> {
  const response = await fetch(url, { method });
  if (!response.ok) {
    throw new Error(`${method} ${url} answered ${response.status}`);
  }
  return response;
}

export function asOfFromLastModified(
  lastModified: string | null,
  now: Date,
): string {
  const date = new Date(lastModified ?? now);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Last-Modified is not a date: ${lastModified}`);
  }
  return date.toISOString().slice(0, 10);
}

export async function fetchSbaFiles(): Promise<LeadFile[]> {
  return sbaFiles(await (await download(SBA_DATASET_PAGE)).text());
}

function asOfFromYymmdd(yymmdd: string): string {
  return `20${yymmdd.slice(0, 2)}-${yymmdd.slice(2, 4)}-${yymmdd.slice(4, 6)}`;
}

export function pppFiles(html: string): LeadFile[] {
  return [...html.matchAll(/href="([^"]*\/public_[^"]*_(\d{6})\.csv)"/g)].map(
    ([, url, yymmdd]) => ({
      kind: 'ppp',
      url: url!,
      asOf: asOfFromYymmdd(yymmdd!),
    }),
  );
}

export function sbaFiles(html: string): LeadFile[] {
  return [
    ...html.matchAll(/href="([^"]*\/FOIA_(7a|504)_[^"]*_asof_(\d{6})\.csv)"/g),
  ].map(([, url, program, yymmdd]) => ({
    kind: program === '504' ? 'sba_504' : 'sba_7a',
    url: url!,
    asOf: asOfFromYymmdd(yymmdd!),
  }));
}

const FORM_5500_YEARS_BACK = [1, 2, 3];

export function form5500Files(now: Date): LeadFileRef[] {
  return FORM_5500_YEARS_BACK.flatMap((back) => {
    const year = now.getUTCFullYear() - back;
    const base = `https://www.askebsa.dol.gov/FOIA%20Files/${year}/Latest`;
    return [
      { kind: 'form_5500' as const, url: `${base}/F_5500_${year}_Latest.zip` },
      {
        kind: 'form_5500_sf' as const,
        url: `${base}/F_5500_SF_${year}_Latest.zip`,
      },
    ];
  });
}
