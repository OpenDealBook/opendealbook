import { ApplicationFailure } from '@temporalio/common';
import { z } from 'zod';

import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

import { normalizeName } from '../../leadMatch/matcher';

const REQUEST_TIMEOUT_MS = 60_000;

const nppesOrganization = z
  .object({
    number: z.string(),
    basic: z.object({ organization_name: z.string(), status: z.string() }).loose(),
    other_names: z.array(z.object({ organization_name: z.string() }).loose()),
    taxonomies: z.array(z.object({ desc: z.string().nullable(), primary: z.boolean() }).loose()),
  })
  .loose();

const nppesPage = z.object({ results: z.array(nppesOrganization) });

const OPEN_DATA_PAGE = 1000;

interface OpenDataSet {
  registry: string;
  dataset: string;
  columns: { names: [string, ...string[]]; number: string; type: string; status: string | null; expires: string };
}

const OPEN_DATA = {
  TX: {
    registry: 'Texas TDLR',
    dataset: '7358-krk7',
    columns: {
      names: ['business_name'],
      number: 'license_number',
      type: 'license_type',
      status: null,
      expires: 'license_expiration_date_mmddccyy',
    },
  },
  IL: {
    registry: 'Illinois IDFPR',
    dataset: 'pzzh-kp68',
    columns: {
      names: ['business_name', 'businessdba'],
      number: 'license_number',
      type: 'description',
      status: 'license_status',
      expires: 'expiration_date',
    },
  },
  CO: {
    registry: 'Colorado DPO',
    dataset: '7s5z-vewr',
    columns: {
      names: ['entityname'],
      number: 'licensenumber',
      type: 'licensetype',
      status: 'licensestatusdescription',
      expires: 'licenseexpirationdate',
    },
  },
  CT: {
    registry: 'Connecticut DCP',
    dataset: 'ngch-56tr',
    columns: {
      names: ['businessname', 'dba'],
      number: 'fullcredentialcode',
      type: 'credential',
      status: 'status',
      expires: 'expirationdate',
    },
  },
  WA: {
    registry: 'Washington L&I',
    dataset: 'm8qx-ubtq',
    columns: {
      names: ['businessname'],
      number: 'contractorlicensenumber',
      type: 'contractorlicensetypecodedesc',
      status: 'contractorlicensestatus',
      expires: 'licenseexpirationdate',
    },
  },
} satisfies Record<string, OpenDataSet>;

type OpenDataState = keyof typeof OPEN_DATA;

function hasOpenData(state: string): state is OpenDataState {
  return Object.hasOwn(OPEN_DATA, state);
}

export const LICENSE_REGISTRY_URLS = {
  NPPES: 'https://npiregistry.cms.hhs.gov',
  TX: 'https://data.texas.gov',
  IL: 'https://data.illinois.gov',
  CO: 'https://data.colorado.gov',
  CT: 'https://data.ct.gov',
  WA: 'https://data.wa.gov',
} satisfies Record<'NPPES' | OpenDataState, string>;

export type LicenseRegistryUrls = typeof LICENSE_REGISTRY_URLS;

interface Business {
  key: string;
  name: string;
}

export interface LicenseCandidate {
  subjectKey: string;
  source: 'licenses';
  registry: string;
  licenseeName: string;
  licenseNumber: string | null;
  licenseType: string | null;
  status: string | null;
  expiresOn: string | null;
  raw: unknown;
}

type SourceSearch = { candidates: LicenseCandidate[] } | { notChecked: string };

const NO_WORD = 'the name has no word to search by';

async function getJson<Body>(url: string, body: z.ZodType<Body>, signal: AbortSignal | undefined): Promise<Body> {
  const response = await fetch(url, {
    signal: AbortSignal.any([AbortSignal.timeout(REQUEST_TIMEOUT_MS), ...(signal ? [signal] : [])]),
  });
  if (response.status >= 400 && response.status < 500) {
    throw ApplicationFailure.nonRetryable(`${new URL(url).host} answered ${response.status}`);
  }
  if (!response.ok) {
    throw new Error(`${new URL(url).host} answered ${response.status}`);
  }
  const parsed = body.safeParse(await response.json());
  if (!parsed.success) {
    throw ApplicationFailure.nonRetryable(`${new URL(url).host} answered in an unexpected shape: ${parsed.error.message}`);
  }
  return parsed.data;
}

const NPPES_PAGE = 200;
const NPPES_PAGES = 6;
const NPPES_STATUSES = new Map([
  ['A', 'Active'],
  ['D', 'Inactive'],
]);

async function searchNppes(
  origin: string,
  business: Business,
  state: string,
  signal: AbortSignal | undefined,
): Promise<SourceSearch> {
  const wanted = normalizeName(business.name);
  const firstWord = wanted.split(' ').find((word) => (word.match(/[a-z]/g) ?? []).length >= 2);
  if (firstWord === undefined) {
    return { notChecked: `NPPES was not checked: ${NO_WORD}` };
  }
  const organizations: z.infer<typeof nppesOrganization>[] = [];
  for (let page = 0; page < NPPES_PAGES; page += 1) {
    const params = new URLSearchParams({
      version: '2.1',
      enumeration_type: 'NPI-2',
      organization_name: `${firstWord.toUpperCase()}*`,
      state,
      limit: String(NPPES_PAGE),
      skip: String(page * NPPES_PAGE),
    });
    const { results } = await getJson(`${origin}/api/?${params}`, nppesPage, signal);
    organizations.push(...results);
    if (results.length < NPPES_PAGE) {
      return {
        candidates: organizations
          .filter((organization) =>
            [organization.basic, ...organization.other_names].some((named) => normalizeName(named.organization_name) === wanted),
          )
          .map((organization) => ({
            subjectKey: business.key,
            source: 'licenses',
            registry: 'NPPES',
            licenseeName: organization.basic.organization_name,
            licenseNumber: organization.number,
            licenseType: organization.taxonomies.find((taxonomy) => taxonomy.primary)?.desc ?? null,
            status: NPPES_STATUSES.get(organization.basic.status) ?? null,
            expiresOn: null,
            raw: organization,
          })),
      };
    }
  }
  return { notChecked: 'NPPES was not checked: more than 1,200 organizations start with the same word' };
}

function filterWords(name: string): string[] {
  const written = new Set(name.toLowerCase().replaceAll("'", '').split(/[^a-z0-9]+/));
  return normalizeName(name)
    .split(' ')
    .filter((word) => word !== 'and' && written.has(word));
}

function isRealDay(year: string, month: string, day: string): boolean {
  const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.getUTCDate() === Number(day);
}

function expiresOn(written: string | undefined): string | null {
  const parts =
    /^(?<month>\d{2})\/(?<day>\d{2})\/(?<year>\d{4})$/.exec(written ?? '')?.groups ??
    /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})(T|$)/.exec(written ?? '')?.groups;
  return parts && isRealDay(parts.year!, parts.month!, parts.day!) ? `${parts.year}-${parts.month}-${parts.day}` : null;
}

async function searchOpenData(
  origin: string,
  { registry, dataset, columns }: OpenDataSet,
  state: string,
  business: Business,
  signal: AbortSignal | undefined,
): Promise<SourceSearch> {
  const wanted = normalizeName(business.name);
  const words = filterWords(business.name);
  if (words.length === 0) {
    return { notChecked: `License data for ${state} was not checked: ${NO_WORD}` };
  }
  const where = columns.names
    .map(
      (column) =>
        `(${words.map((word) => `upper(replace(${column}, "'", "")) like '%${word.toUpperCase()}%'`).join(' AND ')})`,
    )
    .join(' OR ');
  const [primaryName, ...otherNames] = columns.names;
  const license = z
    .object({
      [primaryName]: z.string(),
      ...Object.fromEntries(otherNames.map((column) => [column, z.string().optional()])),
      [columns.number]: z.string().optional(),
      [columns.type]: z.string(),
      [columns.expires]: z.string().optional(),
      ...(columns.status ? { [columns.status]: z.string() } : {}),
    })
    .loose();
  const rows: z.infer<typeof license>[] = [];
  for (let offset = 0; ; offset += OPEN_DATA_PAGE) {
    const params = new URLSearchParams({
      $where: where,
      $order: ':id',
      $limit: String(OPEN_DATA_PAGE),
      $offset: String(offset),
    });
    const page = await getJson(`${origin}/resource/${dataset}.json?${params}`, z.array(license), signal);
    rows.push(...page);
    if (page.length < OPEN_DATA_PAGE) {
      break;
    }
  }
  return {
    candidates: rows
      .filter((row) => columns.names.some((column) => row[column] !== undefined && normalizeName(row[column]) === wanted))
      .map((row) => ({
        subjectKey: business.key,
        source: 'licenses',
        registry,
        licenseeName: row[primaryName]!,
        licenseNumber: row[columns.number] ?? null,
        licenseType: row[columns.type]!,
        status: columns.status ? row[columns.status]! : null,
        expiresOn: expiresOn(row[columns.expires]),
        raw: row,
      })),
  };
}

const SNAPSHOT_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

const floridaSnapshot = z
  .object({
    snapshot_at: z.string(),
    match_count: z.number(),
    licenses: z.array(
      z.object({
        licensee_name: z.string(),
        license_number: z.string().nullable(),
        license_type: z.string(),
        status: z.string().nullable(),
        expires_on: z.string().nullable(),
        raw: z.json(),
      }),
    ),
  })
  .nullable();

const FLORIDA_MATCH_CAP = 200;

async function searchFloridaSnapshot(business: Business): Promise<SourceSearch> {
  const { data } = await getSupabaseServerAdminClient()
    .rpc('florida_licenses_named', { p_name: normalizeName(business.name) })
    .throwOnError();
  const snapshot = floridaSnapshot.parse(data);
  if (snapshot === null || Date.now() - new Date(snapshot.snapshot_at).getTime() > SNAPSHOT_MAX_AGE_MS) {
    return { notChecked: 'License data is not available for FL' };
  }
  if (snapshot.match_count > FLORIDA_MATCH_CAP) {
    return { notChecked: 'License data for FL was not checked: too many licenses share this name' };
  }
  return {
    candidates: snapshot.licenses.map((license) => ({
      subjectKey: business.key,
      source: 'licenses',
      registry: 'Florida DBPR',
      licenseeName: license.licensee_name,
      licenseNumber: license.license_number,
      licenseType: license.license_type,
      status: license.status,
      expiresOn: license.expires_on,
      raw: license.raw,
    })),
  };
}

async function searchState(
  state: string,
  urls: LicenseRegistryUrls,
  business: Business,
  signal: AbortSignal | undefined,
): Promise<SourceSearch> {
  if (hasOpenData(state)) {
    return searchOpenData(urls[state], OPEN_DATA[state], state, business, signal);
  }
  if (state !== 'FL') {
    return { notChecked: `License data is not available for ${state}` };
  }
  return normalizeName(business.name) === ''
    ? { notChecked: `License data for FL was not checked: ${NO_WORD}` }
    : searchFloridaSnapshot(business);
}

export async function searchLicenses(
  { business, state, signal }: { business: Business; state: string | null; signal?: AbortSignal },
  urls: LicenseRegistryUrls = LICENSE_REGISTRY_URLS,
): Promise<{ candidates: LicenseCandidate[]; notChecked: string[] }> {
  if (state === null) {
    return { candidates: [], notChecked: ['License data is not available for a business with no state'] };
  }
  const searches = await Promise.all([
    searchNppes(urls.NPPES, business, state, signal),
    searchState(state, urls, business, signal),
  ]);
  return {
    candidates: searches.flatMap((search) => ('candidates' in search ? search.candidates : [])),
    notChecked: searches.flatMap((search) => ('notChecked' in search ? [search.notChecked] : [])),
  };
}
