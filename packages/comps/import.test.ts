import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import {
  importComps,
  parseCsv,
  type CompImportInsert,
  type ImportCompsDeps,
  type ProprietaryCompRow,
} from './import';

async function workbookBase64(rows: string[][]): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Export');
  rows.forEach((cells) => sheet.addRow(cells));
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer).toString('base64');
}

const DEALSTATS_XLSX_ROWS = [
  ['Business Description', 'NAICS', 'Sale Date', 'Asking Price', 'MVIC Price', 'Net Sales', 'SDE', 'EBITDA', 'Company Location (state/country)'],
  ['Bookkeeping firm', '541211', '3/15/2024', '$1,200,000', '$1,100,000', '$900,000', '$400,000', '$350,000', 'NV'],
];

const DEALSTATS_CSV = [
  'Business Description,NAICS,Sale Date,Asking Price,MVIC Price,Net Sales,SDE,EBITDA,Company Location (state/country)',
  'Bookkeeping firm,541211,3/15/2024,"$1,200,000","$1,100,000","$900,000","$400,000","$350,000",NV',
].join('\n');

const BIZCOMPS_CSV = [
  'Business Type,SIC,NAICS,Sale Date,Location,Annual Gross Revenue,SDE,Asking Price,Sale Price',
  'Auto repair,7538,811111,1/10/2023,TX,"$500,000","$150,000","$600,000","$550,000"',
].join('\n');

const PEERCOMPS_CSV = [
  'NAICS Code,SIC Code,Sale Date,State / Region,Sale Price,Gross Revenue,SDE,EBITDA',
  '722511,5812,6/1/2022,CA,"$800,000","$1,000,000","$250,000","$200,000"',
].join('\n');

function makeDeps(license: { id: string } | null = { id: 'lic-1' }) {
  const calls = {
    stored: [] as { path: string; body: string }[],
    upserts: [] as ProprietaryCompRow[][],
    imports: [] as CompImportInsert[],
  };
  const deps: ImportCompsDeps = {
    async storeRawFile(path, body) {
      calls.stored.push({ path, body });
    },
    async findActiveLicense() {
      return license;
    },
    async upsertComps(rows) {
      calls.upserts.push(rows);
    },
    async recordImport(record) {
      calls.imports.push(record);
      return { id: 'imp-1' };
    },
  };
  return { deps, calls };
}

describe('parseCsv', () => {
  it('reads quoted fields that contain commas', () => {
    const rows = parseCsv('a,b\n"1,000",x\n');
    expect(rows).toEqual([{ a: '1,000', b: 'x' }]);
  });

  it('ignores a trailing newline rather than emitting a blank row', () => {
    const rows = parseCsv('a\n1\n');
    expect(rows).toHaveLength(1);
  });
});

describe('importComps', () => {
  it('maps a DealStats export to a proprietary comp row and records the import', async () => {
    const { deps, calls } = makeDeps();

    const result = await importComps(
      {
        accountId: 'acc-1',
        vendor: 'dealstats',
        filename: 'export.csv',
        format: 'csv',
        content: DEALSTATS_CSV,
        createdBy: 'user-1',
      },
      deps,
    );

    expect(result).toEqual({ importId: 'imp-1', licenseId: 'lic-1', rowCount: 1 });

    const row = calls.upserts[0]![0]!;
    expect(row).toMatchObject({
      account_id: 'acc-1',
      data_class: 'proprietary',
      source: 'dealstats',
      source_label: 'DealStats',
      price_basis: 'actual',
      confidence: 'high',
      naics_code: '541211',
      industry: 'Bookkeeping firm',
      state: 'NV',
      close_date: '2024-03-15',
      asking_price: 1_200_000,
      sale_price: 1_100_000,
      revenue: 900_000,
      sde: 400_000,
      ebitda: 350_000,
      region: null,
      created_by: 'user-1',
    });
    expect(row.source_ref.length).toBeGreaterThan(0);

    expect(calls.stored[0]!.path.startsWith('acc-1/dealstats/')).toBe(true);
    expect(calls.stored[0]!.body).toBe(DEALSTATS_CSV);

    expect(calls.imports[0]).toMatchObject({
      account_id: 'acc-1',
      license_id: 'lic-1',
      vendor: 'dealstats',
      filename: 'export.csv',
      status: 'imported',
      row_count: 1,
      created_by: 'user-1',
    });
    expect(calls.imports[0]!.storage_path).toBe(calls.stored[0]!.path);
  });

  it('maps a BIZCOMPS export under its own source and label', async () => {
    const { deps, calls } = makeDeps();

    await importComps(
      {
        accountId: 'acc-1',
        vendor: 'bizcomps',
        filename: 'b.csv',
        format: 'csv',
        content: BIZCOMPS_CSV,
        createdBy: 'user-1',
      },
      deps,
    );

    expect(calls.upserts[0]![0]).toMatchObject({
      data_class: 'proprietary',
      source: 'bizcomps',
      source_label: 'BIZCOMPS',
      confidence: 'medium',
      naics_code: '811111',
      state: 'TX',
      revenue: 500_000,
      sde: 150_000,
      sale_price: 550_000,
    });
  });

  it('maps a PeerComps export under its own source and label', async () => {
    const { deps, calls } = makeDeps();

    await importComps(
      {
        accountId: 'acc-1',
        vendor: 'peercomps',
        filename: 'p.csv',
        format: 'csv',
        content: PEERCOMPS_CSV,
        createdBy: 'user-1',
      },
      deps,
    );

    expect(calls.upserts[0]![0]).toMatchObject({
      data_class: 'proprietary',
      source: 'peercomps',
      source_label: 'PeerComps',
      naics_code: '722511',
      state: 'CA',
      sale_price: 800_000,
      revenue: 1_000_000,
      sde: 250_000,
      ebitda: 200_000,
    });
  });

  it('refuses to import without an active comp license', async () => {
    const { deps, calls } = makeDeps(null);

    await expect(
      importComps(
        {
          accountId: 'acc-1',
          vendor: 'dealstats',
          filename: 'export.csv',
          format: 'csv',
          content: DEALSTATS_CSV,
          createdBy: 'user-1',
        },
        deps,
      ),
    ).rejects.toThrow(/license/i);

    expect(calls.upserts).toHaveLength(0);
    expect(calls.stored).toHaveLength(0);
    expect(calls.imports).toHaveLength(0);
  });

  it('maps a DealStats xlsx export through the same column-map path as csv', async () => {
    const { deps, calls } = makeDeps();
    const content = await workbookBase64(DEALSTATS_XLSX_ROWS);

    const result = await importComps(
      {
        accountId: 'acc-1',
        vendor: 'dealstats',
        filename: 'export.xlsx',
        format: 'xlsx',
        content,
        createdBy: 'user-1',
      },
      deps,
    );

    expect(result).toEqual({ importId: 'imp-1', licenseId: 'lic-1', rowCount: 1 });

    expect(calls.upserts[0]![0]).toMatchObject({
      account_id: 'acc-1',
      data_class: 'proprietary',
      source: 'dealstats',
      source_label: 'DealStats',
      confidence: 'high',
      naics_code: '541211',
      industry: 'Bookkeeping firm',
      state: 'NV',
      close_date: '2024-03-15',
      asking_price: 1_200_000,
      sale_price: 1_100_000,
      revenue: 900_000,
      sde: 400_000,
      ebitda: 350_000,
    });

    expect(calls.stored[0]!.body).toBe(content);
    expect(calls.imports[0]).toMatchObject({ filename: 'export.xlsx', row_count: 1 });
  });

  it('surfaces an empty xlsx file as a clear error rather than crashing', async () => {
    const { deps } = makeDeps();

    await expect(
      importComps(
        {
          accountId: 'acc-1',
          vendor: 'dealstats',
          filename: 'export.xlsx',
          format: 'xlsx',
          content: '',
          createdBy: 'user-1',
        },
        deps,
      ),
    ).rejects.toThrow(/xlsx/i);
  });

  it('surfaces an xlsx workbook with no header row as a clear error', async () => {
    const { deps } = makeDeps();
    const content = await workbookBase64([]);

    await expect(
      importComps(
        {
          accountId: 'acc-1',
          vendor: 'dealstats',
          filename: 'empty.xlsx',
          format: 'xlsx',
          content,
          createdBy: 'user-1',
        },
        deps,
      ),
    ).rejects.toThrow(/header/i);
  });

  it('keys the upsert idempotently per account so a tenant never collides with another', async () => {
    const { deps: depsA, calls: callsA } = makeDeps();
    const { deps: depsB, calls: callsB } = makeDeps();

    const base = {
      vendor: 'dealstats' as const,
      filename: 'export.csv',
      format: 'csv' as const,
      content: DEALSTATS_CSV,
      createdBy: 'user-1',
    };

    await importComps({ accountId: 'acc-1', ...base }, depsA);
    await importComps({ accountId: 'acc-1', ...base }, depsA);
    await importComps({ accountId: 'acc-2', ...base }, depsB);

    const first = callsA.upserts[0]![0]!.source_ref;
    const second = callsA.upserts[1]![0]!.source_ref;
    const other = callsB.upserts[0]![0]!.source_ref;

    expect(second).toBe(first);
    expect(other).not.toBe(first);
  });
});
