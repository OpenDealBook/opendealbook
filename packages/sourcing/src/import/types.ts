export type FirmImportField =
  | 'name'
  | 'industry'
  | 'city'
  | 'state'
  | 'website'
  | 'employee_band'
  | 'established_year'
  | 'owner_name'
  | 'owner_age_estimate'
  | 'source_url'
  | 'phone';

export type FirmFieldMapping = Partial<Record<FirmImportField, string>>;

export interface NormalizedFirmRow {
  name: string | null;
  industry: string | null;
  city: string | null;
  state: string | null;
  website: string | null;
  employee_band: string | null;
  established_year: number | null;
  owner_name: string | null;
  owner_age_estimate: number | null;
  source_url: string | null;
  phone: string | null;
}

export interface ExistingFirmKey {
  website: string | null;
  phone: string | null;
}
