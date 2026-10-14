import { createClient } from '@supabase/supabase-js';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '@odb/supabase';

import { brandLogoUrl } from './logo-url';
import { type LenderBrand, lookupBrand } from './lookup-brand';
import {
  answer,
  type FakeSite,
  fakeSite,
  html,
  PNG,
  png,
  redirect,
  requestedUrls,
} from './test-support/fake-site';

process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??=
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
process.env.SUPABASE_SERVICE_ROLE_KEY ??=
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const admin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const domains: string[] = [];

function newDomain(): string {
  const domain = `brand-${crypto.randomUUID().slice(0, 8)}.test`;
  domains.push(domain);

  return domain;
}

function bankSite(host: string, name = 'First Bank') {
  return fakeSite({
    [`https://${host}/`]: html(
      `<title>${name}</title><link rel="apple-touch-icon" href="/touch.png">`,
    ),
    [`https://${host}/touch.png`]: answer(200, 'application/octet-stream', PNG),
  });
}

async function readRow(domain: string) {
  const { data } = await admin
    .from('lender_brand')
    .select('*')
    .eq('domain', domain)
    .maybeSingle()
    .throwOnError();

  return data;
}

afterAll(async () => {
  await admin.storage
    .from('lender-brand')
    .remove(domains.map((domain) => `${domain}/logo`));
  await admin
    .from('lender_brand')
    .delete()
    .in('domain', domains)
    .throwOnError();
});

describe('lookupBrand for an unknown domain (integration)', () => {
  let domain: string;
  let site: FakeSite;
  let brand: LenderBrand | null;
  let startedAt: number;

  beforeAll(async () => {
    domain = newDomain();
    site = bankSite(`www.${domain}`);
    startedAt = Date.now();
    brand = await lookupBrand(
      `https://WWW.${domain.toUpperCase()}/about-us`,
      site,
    );
  });

  it('returns the name and the logo path under the bare domain', () => {
    expect(brand).toEqual({
      domain,
      name: 'First Bank',
      logoPath: `${domain}/logo`,
    });
  });

  it('fetches the page and the icon once each, from the host as entered', () => {
    expect(requestedUrls(site)).toEqual([
      `https://www.${domain}/`,
      `https://www.${domain}/touch.png`,
    ]);
  });

  it('caches the row with the time it was fetched', async () => {
    const row = await readRow(domain);

    expect(row).toMatchObject({
      domain,
      name: 'First Bank',
      logo_path: `${domain}/logo`,
    });
    expect(new Date(row!.fetched_at!).getTime()).toBeGreaterThan(
      startedAt - 60_000,
    );
  });

  it('stores the logo bytes behind a signed URL', async () => {
    const logo = await fetch((await brandLogoUrl(`${domain}/logo`))!);

    expect(Buffer.from(await logo.arrayBuffer())).toEqual(PNG);
  });

  it('serves the logo with the type of its bytes, not the type the site declared', async () => {
    const logo = await fetch((await brandLogoUrl(`${domain}/logo`))!);

    expect(logo.headers.get('content-type')).toBe('image/png');
  });
});

describe('lookupBrand (integration)', () => {
  it('answers a cached domain without touching the network', async () => {
    const domain = newDomain();

    await lookupBrand(`https://${domain}`, bankSite(domain));

    const renamed = bankSite(domain, 'Renamed Bank');
    const brand = await lookupBrand(`http://www.${domain}/loans`, renamed);

    expect(brand).toEqual({
      domain,
      name: 'First Bank',
      logoPath: `${domain}/logo`,
    });
    expect(renamed.requests).toEqual([]);
  });

  it('keys the cache by the domain entered, not the one the site redirects to', async () => {
    const entered = newDomain();
    const landed = newDomain();

    const brand = await lookupBrand(
      entered,
      fakeSite({
        [`https://${entered}/`]: redirect(`https://${landed}/`),
        [`https://${landed}/`]: html('<title>Landed Bancorp</title>'),
        [`https://${landed}/favicon.ico`]: png(),
      }),
    );

    expect(brand).toEqual({
      domain: entered,
      name: 'Landed Bancorp',
      logoPath: `${entered}/logo`,
    });
    expect(await readRow(landed)).toBeNull();
  });

  it('caches a site that has a name but no usable icon with a null logo', async () => {
    const domain = newDomain();

    const brand = await lookupBrand(
      domain,
      fakeSite({
        [`https://${domain}/`]: html('<title>Iconless Bank</title>'),
      }),
    );

    expect(brand).toEqual({ domain, name: 'Iconless Bank', logoPath: null });
    expect(await readRow(domain)).toMatchObject({
      name: 'Iconless Bank',
      logo_path: null,
    });

    const { data: objects } = await admin.storage
      .from('lender-brand')
      .list(domain);

    expect(objects).toEqual([]);
  });

  it('returns no brand when the site gives none', async () => {
    const domain = newDomain();
    const site = fakeSite({}, [domain]);

    expect(await lookupBrand(domain, site)).toBeNull();
  });

  it('records a failed lookup as a row with no name, no logo, and the time it was tried', async () => {
    const domain = newDomain();
    const startedAt = Date.now();

    await lookupBrand(domain, fakeSite({}, [domain]));

    const row = await readRow(domain);

    expect(row).toMatchObject({ domain, name: null, logo_path: null });
    expect(new Date(row!.fetched_at!).getTime()).toBeGreaterThan(
      startedAt - 60_000,
    );
  });

  it('answers a domain that failed before from the cache, without a request', async () => {
    const domain = newDomain();

    await lookupBrand(domain, fakeSite({}, [domain]));

    const working = bankSite(domain);

    expect(await lookupBrand(domain, working)).toBeNull();
    expect(working.requests).toEqual([]);
  });

  it('returns no brand for something that is not a domain, without a request', async () => {
    const site = fakeSite({});

    expect(await lookupBrand('first_bank.test\\..', site)).toBeNull();
    expect(site.requests).toEqual([]);

    const { count } = await admin
      .from('lender_brand')
      .select('*', { count: 'exact', head: true })
      .like('domain', '%first_bank%')
      .throwOnError();

    expect(count).toBe(0);
  });
});

describe('brandLogoUrl (integration)', () => {
  it('gives no URL for a logo whose stored object is gone', async () => {
    expect(await brandLogoUrl(`${newDomain()}/logo`)).toBeNull();
  });

  it('throws when storage cannot be reached', async () => {
    const reachable = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:9';

    try {
      await expect(brandLogoUrl(`${newDomain()}/logo`)).rejects.toThrow(
        'fetch failed',
      );
    } finally {
      process.env.NEXT_PUBLIC_SUPABASE_URL = reachable;
    }
  });
});
