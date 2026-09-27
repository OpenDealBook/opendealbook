import Papa from 'papaparse';

import { normalizeInteger, normalizeText } from './normalize';
import type { FirmFieldMapping, NormalizedFirmRow } from './types';

type CsvRecord = Record<string, string | undefined>;

function cell(
  record: CsvRecord,
  column: string | undefined,
): string | undefined {
  return column === undefined ? undefined : record[column];
}

export function parseFirmCsv(
  csvText: string,
  mapping: FirmFieldMapping,
): NormalizedFirmRow[] {
  const parsed = Papa.parse<CsvRecord>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  return parsed.data.map((record) => ({
    name: normalizeText(cell(record, mapping.name)),
    industry: normalizeText(cell(record, mapping.industry)),
    city: normalizeText(cell(record, mapping.city)),
    state: normalizeText(cell(record, mapping.state)),
    website: normalizeText(cell(record, mapping.website)),
    employee_band: normalizeText(cell(record, mapping.employee_band)),
    established_year: normalizeInteger(cell(record, mapping.established_year)),
    owner_name: normalizeText(cell(record, mapping.owner_name)),
    owner_age_estimate: normalizeInteger(
      cell(record, mapping.owner_age_estimate),
    ),
    source_url: normalizeText(cell(record, mapping.source_url)),
    phone: normalizeText(cell(record, mapping.phone)),
  }));
}
