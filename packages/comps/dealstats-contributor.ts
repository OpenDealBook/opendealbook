export interface ContributorDealInput {
  businessDescription: string;
  naicsCode: string;
  sicCode?: string;
  saleDate: string;
  transactionType: 'Asset' | 'Stock';
  salePrice: number;
  revenue: number;
  sde: number;
  ebitda: number;
  ownerCompensation?: number;
  state: string;
}

export interface ContributorFieldSpec {
  label: string;
  verified: boolean;
}

// Labels and their verified status come from the DealStats Companion Guide
// transaction report (bvresources.com), the same public source behind
// vendors/dealstats-v1.json. The contributor intake form is not published, so
// intake-only fields are marked unverified and must be confirmed against the
// real submission template before a live submission.
export const DEALSTATS_CONTRIBUTOR_FIELDS: ContributorFieldSpec[] = [
  { label: 'Business Description', verified: true },
  { label: 'SIC', verified: true },
  { label: 'NAICS', verified: true },
  { label: 'Sale Date', verified: true },
  { label: 'Transaction Type', verified: true },
  { label: 'MVIC Price', verified: true },
  { label: 'Net Sales', verified: true },
  { label: 'SDE', verified: true },
  { label: 'EBITDA', verified: true },
  { label: "Owner's Compensation", verified: true },
  { label: 'Company Location (state/country)', verified: false },
  { label: 'Contributor Reference', verified: false },
];

export interface DealStatsContributorSubmission {
  vendor: 'DealStats';
  format: 'contributor-v1';
  fields: Record<string, string | number | null>;
  unverifiedFields: string[];
}

export function buildDealStatsContributorPackage(
  input: ContributorDealInput,
): DealStatsContributorSubmission {
  const values: Record<string, string | number | null> = {
    'Business Description': input.businessDescription,
    SIC: input.sicCode ?? null,
    NAICS: input.naicsCode,
    'Sale Date': input.saleDate,
    'Transaction Type': input.transactionType,
    'MVIC Price': input.salePrice,
    'Net Sales': input.revenue,
    SDE: input.sde,
    EBITDA: input.ebitda,
    "Owner's Compensation": input.ownerCompensation ?? null,
    'Company Location (state/country)': input.state,
    'Contributor Reference': null,
  };

  const fields: Record<string, string | number | null> = {};
  for (const spec of DEALSTATS_CONTRIBUTOR_FIELDS) {
    fields[spec.label] = values[spec.label] ?? null;
  }

  return {
    vendor: 'DealStats',
    format: 'contributor-v1',
    fields,
    unverifiedFields: DEALSTATS_CONTRIBUTOR_FIELDS.filter((f) => !f.verified).map((f) => f.label),
  };
}
