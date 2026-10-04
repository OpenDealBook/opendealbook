import { createHash, randomUUID } from 'node:crypto';

import bizcomps from './vendors/bizcomps-v1.json';
import dealstats from './vendors/dealstats-v1.json';
import peercomps from './vendors/peercomps-v1.json';
import { loadColumnMap, mapRow, type ColumnMap, type ParsedValue } from './vendors/column-map';

export type VendorKey = 'dealstats' | 'bizcomps' | 'peercomps';
export type ImportFormat = 'csv' | 'xlsx';

export interface ProprietaryCompRow {
  account_id: string;
  data_class: 'proprietary';
  source: VendorKey;
  source_label: string;
  source_ref: string;
  price_basis: string;
  confidence: string;
  naics_code: string | null;
  industry: string | null;
  region: null;
  state: string | null;
  close_date: string | null;
  asking_price: number | null;
  sale_price: number | null;
  revenue: number | null;
  sde: number | null;
  ebitda: number | null;
  created_by: string;
}

export interface CompImportInsert {
  account_id: string;
  license_id: string;
  vendor: VendorKey;
  filename: string;
  status: string;
  row_count: number;
  storage_path: string;
  imported_at: string;
  created_by: string;
}

export interface ImportCompsInput {
  accountId: string;
  vendor: VendorKey;
  filename: string;
  format: ImportFormat;
  content: string;
  createdBy: string;
}

export interface ImportCompsDeps {
  storeRawFile(path: string, body: string): Promise<void>;
  findActiveLicense(accountId: string, vendor: VendorKey): Promise<{ id: string } | null>;
  upsertComps(rows: ProprietaryCompRow[]): Promise<void>;
  recordImport(record: CompImportInsert): Promise<{ id: string }>;
}

export interface ImportCompsResult {
  importId: string;
  licenseId: string;
  rowCount: number;
}

interface VendorConfig {
  map: ColumnMap;
  source: VendorKey;
  sourceLabel: string;
  priceBasis: string;
  confidence: string;
}

function vendorConfig(raw: unknown, source: VendorKey): VendorConfig {
  const map = loadColumnMap(raw);
  const meta = raw as { price_basis?: string; default_confidence?: string };
  return {
    map,
    source,
    sourceLabel: map.vendor,
    priceBasis: meta.price_basis ?? 'actual',
    confidence: meta.default_confidence ?? 'medium',
  };
}

const VENDOR_CONFIG: Record<VendorKey, VendorConfig> = {
  dealstats: vendorConfig(dealstats, 'dealstats'),
  bizcomps: vendorConfig(bizcomps, 'bizcomps'),
  peercomps: vendorConfig(peercomps, 'peercomps'),
};

function parseCsvGrid(text: string): string[][] {
  const grid: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      quoted = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (ch === '\r') {
      i += 1;
      continue;
    }
    if (ch === '\n') {
      row.push(field);
      grid.push(row);
      row = [];
      field = '';
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    grid.push(row);
  }
  return grid.filter((cells) => !(cells.length === 1 && cells[0] === ''));
}

export function parseCsv(text: string): Record<string, string>[] {
  const grid = parseCsvGrid(text);
  const header = grid[0];
  if (!header) {
    return [];
  }
  return grid.slice(1).map((cells) => {
    const record: Record<string, string> = {};
    header.forEach((key, index) => {
      record[key] = cells[index] ?? '';
    });
    return record;
  });
}

function asString(value: ParsedValue | undefined): string | null {
  return typeof value === 'string' ? value : null;
}

function asNumber(value: ParsedValue | undefined): number | null {
  return typeof value === 'number' ? value : null;
}

function upsertKey(accountId: string, vendor: VendorKey, mapped: Record<string, ParsedValue>): string {
  return createHash('sha256')
    .update(`${accountId}|${vendor}|${JSON.stringify(mapped)}`)
    .digest('hex');
}

function toProprietaryCompRow(
  config: VendorConfig,
  input: ImportCompsInput,
  record: Record<string, string>,
): ProprietaryCompRow {
  const mapped = mapRow(config.map, record);
  return {
    account_id: input.accountId,
    data_class: 'proprietary',
    source: config.source,
    source_label: config.sourceLabel,
    source_ref: upsertKey(input.accountId, config.source, mapped),
    price_basis: config.priceBasis,
    confidence: config.confidence,
    naics_code: asString(mapped.naics),
    industry: asString(mapped.description),
    region: null,
    state: asString(mapped.state),
    close_date: asString(mapped.sale_date),
    asking_price: asNumber(mapped.asking_price),
    sale_price: asNumber(mapped.sale_price),
    revenue: asNumber(mapped.revenue),
    sde: asNumber(mapped.sde),
    ebitda: asNumber(mapped.ebitda),
    created_by: input.createdBy,
  };
}

export async function importComps(
  input: ImportCompsInput,
  deps: ImportCompsDeps,
): Promise<ImportCompsResult> {
  if (input.format === 'xlsx') {
    throw new Error(
      'XLSX vendor imports are not supported yet; export the vendor file as CSV',
    );
  }

  const license = await deps.findActiveLicense(input.accountId, input.vendor);
  if (!license) {
    throw new Error(
      `No active ${input.vendor} comp license for account ${input.accountId}`,
    );
  }

  const config = VENDOR_CONFIG[input.vendor];
  const rows = parseCsv(input.content).map((record) =>
    toProprietaryCompRow(config, input, record),
  );

  const storagePath = `${input.accountId}/${input.vendor}/${randomUUID()}-${input.filename}`;
  await deps.storeRawFile(storagePath, input.content);

  if (rows.length > 0) {
    await deps.upsertComps(rows);
  }

  const imported = await deps.recordImport({
    account_id: input.accountId,
    license_id: license.id,
    vendor: input.vendor,
    filename: input.filename,
    status: 'imported',
    row_count: rows.length,
    storage_path: storagePath,
    imported_at: new Date().toISOString(),
    created_by: input.createdBy,
  });

  return { importId: imported.id, licenseId: license.id, rowCount: rows.length };
}
