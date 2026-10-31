import { createClient } from '@supabase/supabase-js';

import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import '../../../test-support/integration-harness';
import { type LicenseRegistryUrls, searchLicenses } from './licenses';

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const nppes = { close: () => {} };
let urls: LicenseRegistryUrls;
const imports: string[] = [];

beforeAll(async () => {
  const server = createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        result_count: 1,
        results: [
          {
            number: '1999000017',
            basic: { organization_name: 'HARBOR FIXTURE DENTAL PLLC', status: 'A' },
            other_names: [],
            taxonomies: [{ desc: 'Dentist', primary: true }],
          },
        ],
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  urls = { NPPES: origin, TX: origin, IL: origin, CO: origin, CT: origin, WA: origin };
  nppes.close = () => server.close();
});

afterAll(async () => {
  nppes.close();
  await admin.from('florida_license_import').delete().in('id', imports).throwOnError();
});

afterEach(() => vi.useRealTimers());

async function snapshot(
  status: 'running' | 'succeeded',
  licenses: { licensee_name: string; normalized_names: string[] }[],
  createdAt = new Date(),
) {
  const { data } = await admin
    .from('florida_license_import')
    .insert({ status, created_at: createdAt.toISOString() })
    .select('id')
    .single()
    .throwOnError();
  imports.push(data.id);
  await admin
    .from('florida_license')
    .insert(
      licenses.map((license, index) => ({
        ...license,
        import_id: data.id,
        file: 'CONSTRUCTIONLICENSE_1.csv',
        license_number: `CBC00${index}`,
        license_type: 'CBC',
        status: 'Active',
        expires_on: '2028-08-31',
        raw: [license.licensee_name],
      })),
    )
    .throwOnError();
  return data.id;
}

const HARBOR = { key: 'firm', name: 'Harbor Fixture Dental, PLLC' };

describe('searchLicenses for a Florida business', () => {
  it('returns the licenses in the newest succeeded Florida snapshot with a name that is exactly the business name', async () => {
    await snapshot('succeeded', [{ licensee_name: 'HARBOR FIXTURE DENTAL LLC', normalized_names: ['harbor fixture dental'] }]);
    await snapshot('succeeded', [
      { licensee_name: 'HARBOR FIXTURE DENTAL, LLC', normalized_names: ['harbor fixture dental'] },
      { licensee_name: 'HARBOR FIXTURE DENTAL SUPPLY', normalized_names: ['harbor fixture dental supply'] },
      { licensee_name: 'EXAMPLE, PAT', normalized_names: ['example pat', 'harbor fixture dental'] },
    ]);
    await snapshot('running', [{ licensee_name: 'HARBOR FIXTURE DENTAL INC', normalized_names: ['harbor fixture dental'] }]);

    const { candidates, notChecked } = await searchLicenses({ business: HARBOR, state: 'FL' }, urls);

    expect(notChecked).toEqual([]);
    expect(candidates).toEqual([
      expect.objectContaining({ registry: 'NPPES', licenseNumber: '1999000017' }),
      {
        subjectKey: 'firm',
        source: 'licenses',
        registry: 'Florida DBPR',
        licenseeName: 'HARBOR FIXTURE DENTAL, LLC',
        licenseNumber: 'CBC000',
        licenseType: 'CBC',
        status: 'Active',
        expiresOn: '2028-08-31',
        raw: ['HARBOR FIXTURE DENTAL, LLC'],
      },
      expect.objectContaining({ licenseeName: 'EXAMPLE, PAT', licenseNumber: 'CBC002' }),
    ]);
  });
});

describe('searchLicenses for a Florida business when the newest Florida snapshot is more than 14 days old', () => {
  it('notes that Florida was not checked', async () => {
    await snapshot('succeeded', [{ licensee_name: 'HARBOR FIXTURE DENTAL, LLC', normalized_names: ['harbor fixture dental'] }]);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 15 * 24 * 60 * 60 * 1000);

    const result = await searchLicenses({ business: HARBOR, state: 'FL' }, urls);

    expect(result).toEqual({
      candidates: [expect.objectContaining({ registry: 'NPPES' })],
      notChecked: ['License data is not available for FL'],
    });
  });
});

describe('searchLicenses for a Florida business whose name more than 200 Florida licenses share', () => {
  it('notes that Florida was not checked', async () => {
    await snapshot(
      'succeeded',
      Array.from({ length: 201 }, () => ({ licensee_name: 'HARBOR FIXTURE DENTAL', normalized_names: ['harbor fixture dental'] })),
    );

    const result = await searchLicenses({ business: HARBOR, state: 'FL' }, urls);

    expect(result).toEqual({
      candidates: [expect.objectContaining({ registry: 'NPPES' })],
      notChecked: ['License data for FL was not checked: too many licenses share this name'],
    });
  });
});
