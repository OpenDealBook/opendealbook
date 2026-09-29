import { afterEach, describe, expect, it, vi } from 'vitest';

import { sbaUpsertKey } from '@odb/comps';

import { discoverSbaResources, loadDealBoxNaicsUnion, refreshSbaProgram } from './sbaLoans';

const state = vi.hoisted(() => ({ client: null as unknown }));

vi.mock('@odb/supabase/admin', () => ({
  getSupabaseServerAdminClient: () => state.client,
}));

function makeClient(seed: { deal_box?: unknown[]; comp_insert?: Record<string, unknown> }) {
  const capture = {
    upserts: {} as Record<string, { rows: unknown; onConflict?: string }>,
    inserts: {} as Record<string, unknown>,
  };

  const client = {
    from(table: string) {
      const builder = {
        select() {
          const result = { data: seed.deal_box ?? [], error: null };
          return {
            single: async () => ({ data: seed.comp_insert ?? null, error: null }),
            then: (resolve: (value: typeof result) => unknown) => resolve(result),
          };
        },
        upsert(rows: unknown, options?: { onConflict?: string }) {
          capture.upserts[table] = { rows, onConflict: options?.onConflict };
          return { then: (resolve: (value: { error: null }) => unknown) => resolve({ error: null }) };
        },
        insert(row: unknown) {
          capture.inserts[table] = row;
          return {
            select: () => ({ single: async () => ({ data: seed.comp_insert ?? null, error: null }) }),
          };
        },
      };
      return builder;
    },
  };

  return { client, capture };
}

function stubFetch(handler: (url: string) => unknown): void {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => handler(url)));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('discoverSbaResources', () => {
  it('classifies live CKAN CSV resources into 7(a) and 504 without hard-coding dated file names', async () => {
    stubFetch(() => ({
      json: async () => ({
        result: {
          resources: [
            { name: 'FOIA 7a FY2020 Present', url: 'https://sba.test/FOIA_7a_FY2020_Present_asof_260630.csv', format: 'CSV' },
            { name: 'FOIA 504 FY2010 Present', url: 'https://sba.test/FOIA_504_FY2010_Present_asof_260630.csv', format: 'CSV' },
            { name: 'Data dictionary', url: 'https://sba.test/7a_504_foia_data_dictionary.xlsx', format: 'XLSX' },
          ],
        },
      }),
    }));

    const result = await discoverSbaResources();

    expect(result.sevenA).toEqual(['https://sba.test/FOIA_7a_FY2020_Present_asof_260630.csv']);
    expect(result.fiveOhFour).toEqual(['https://sba.test/FOIA_504_FY2010_Present_asof_260630.csv']);
  });
});

describe('loadDealBoxNaicsUnion', () => {
  it('unions NAICS codes drawn from every tenant deal box criteria', async () => {
    const { client } = makeClient({
      deal_box: [
        { criteria_json: { naics: ['541211', '541219'] } },
        { criteria_json: { naics: ['541211'] } },
        { criteria_json: {} },
      ],
    });
    state.client = client;

    expect((await loadDealBoxNaicsUnion()).sort()).toEqual(['541211', '541219']);
  });
});

describe('refreshSbaProgram', () => {
  const csv = [
    'Program,LocationID,BorrName,BorrCity,BorrState,BankName,GrossApproval,ApprovalDate,TermInMonths,NaicsCode,NaicsDescription,FranchiseName,FranchiseCode',
    '7A,1234,Acme Bookkeeping LLC,Austin,TX,First National,850000,3/15/2024,120,541219,Other Accounting,,',
    '7A,1234,Skip Manufacturing,Austin,TX,First National,850000,3/15/2024,120,333999,Machinery,,',
  ].join('\n');

  it('parses the CSV, filters to the NAICS union, maps price and upserts external comps on source_ref', async () => {
    const { client, capture } = makeClient({});
    state.client = client;
    stubFetch(() => ({ text: async () => csv }));

    const result = await refreshSbaProgram({
      program: '7a',
      urls: ['https://sba.test/file.csv'],
      naicsCodes: ['541219'],
      ratio: 0.85,
    });

    expect(result.upserted).toBe(1);
    const write = capture.upserts.comp!;
    expect(write.onConflict).toBe('source,source_ref');
    const rows = write.rows as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      account_id: null,
      data_class: 'external',
      source: 'sba_foia',
      source_label: 'SBA 7(a) FOIA',
      price_basis: 'loan_proxy',
      confidence: 'proxy',
      naics_code: '541219',
      state: 'TX',
      close_date: '2024-03-15',
      sale_price: 1_000_000,
    });
    expect(rows[0]!.source_ref).toBe(
      sbaUpsertKey({
        Program: '7A',
        LocationID: '1234',
        BorrName: 'Acme Bookkeeping LLC',
        ApprovalDate: '3/15/2024',
        GrossApproval: '850000',
      }),
    );
  });

  it('writes nothing when no parsed row matches the NAICS union', async () => {
    const { client, capture } = makeClient({});
    state.client = client;
    stubFetch(() => ({ text: async () => csv }));

    const result = await refreshSbaProgram({
      program: '7a',
      urls: ['https://sba.test/file.csv'],
      naicsCodes: ['999999'],
      ratio: 0.85,
    });

    expect(result.upserted).toBe(0);
    expect(capture.upserts.comp).toBeUndefined();
  });
});
