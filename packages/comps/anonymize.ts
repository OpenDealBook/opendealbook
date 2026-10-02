import { createHash } from 'node:crypto';

const INDUSTRY_SHORT_NAMES: Record<string, string> = {
  '541211': 'CPA Firm',
  '541213': 'Tax Practice',
  '541214': 'Payroll',
  '541219': 'Bookkeeping',
  '541618': 'Advisory',
};

export function industryShortName(naics: string): string {
  const name = INDUSTRY_SHORT_NAMES[naics];
  if (name === undefined) {
    throw new Error(`No industry short name seeded for NAICS ${naics}`);
  }
  return name;
}

export interface PseudonymParts {
  state: string;
  industryShortName: string;
  sequence: number;
}

export function generatePseudonym(parts: PseudonymParts): string {
  return `${parts.state} ${parts.industryShortName} ${parts.sequence}`;
}

export function roundMoney(value: number): number {
  const band = value < 1_000_000 ? 10_000 : value < 5_000_000 ? 50_000 : 100_000;
  return Math.round(value / band) * band;
}

export function roundPercentTo5(value: number): number {
  return Math.round(value / 5) * 5;
}

export function roundServiceMix(mix: Record<string, number>): Record<string, number> {
  const rounded: Record<string, number> = {};
  for (const [service, share] of Object.entries(mix)) {
    rounded[service] = Math.round(share / 10) * 10;
  }
  return rounded;
}

export function employeeBand(count: number): string {
  if (count <= 4) return '1-4';
  if (count <= 9) return '5-9';
  if (count <= 19) return '10-19';
  if (count <= 49) return '20-49';
  return '50+';
}

export function businessAgeBand(years: number): string {
  if (years < 5) return '<5';
  if (years <= 10) return '5-10';
  if (years <= 20) return '10-20';
  return '20+';
}

export function coarsenGeography(cbsa: string | null): string {
  return cbsa ?? 'rural';
}

export function naics3(naics: string): string {
  return naics.slice(0, 3);
}

export function fiscalQuarter(isoDate: string): string {
  const year = isoDate.slice(0, 4);
  const month = Number(isoDate.slice(5, 7));
  return `${year}-Q${Math.ceil(month / 3)}`;
}

export function poolFingerprint(parts: {
  region: string | null;
  naics: string | null;
  quarter: string;
}): string {
  const material = [parts.region ?? '', parts.naics ?? '', parts.quarter].join('|');
  return createHash('sha256').update(material).digest('hex');
}

export type ActivityConfidence = 'listed' | 'screened' | 'verified';

export interface DealActivityRecord {
  region: string | null;
  naics: string | null;
  industryShort: string | null;
  createdAt: string;
  confidence: ActivityConfidence;
  askingPrice: number | null;
  loiPrice: number | null;
  furthestStage: string;
  outcome: string | null;
  outcomeReason: string | null;
  lossReason: string | null;
}

export interface AnonymizedActivity {
  region: string | null;
  naics3: string | null;
  industryShort: string | null;
  createdQuarter: string;
  confidence: ActivityConfidence;
  askingPriceBanded: number | null;
  loiPriceBanded: number | null;
  furthestStage: string;
  outcome: string | null;
  outcomeReason: string | null;
  lossReason: string | null;
}

export function anonymizeDealActivity(record: DealActivityRecord): AnonymizedActivity {
  return {
    region: record.region,
    naics3: record.naics === null ? null : naics3(record.naics),
    industryShort: record.industryShort,
    createdQuarter: fiscalQuarter(record.createdAt),
    confidence: record.confidence,
    askingPriceBanded: record.askingPrice === null ? null : roundMoney(record.askingPrice),
    loiPriceBanded: record.loiPrice === null ? null : roundMoney(record.loiPrice),
    furthestStage: record.furthestStage,
    outcome: record.outcome,
    outcomeReason: record.outcomeReason,
    lossReason: record.lossReason,
  };
}

export interface ClosePoolRecord {
  region: string | null;
  naics: string | null;
  industryShort: string | null;
  closeDate: string;
  salePrice: number;
  revenue: number;
  sde: number;
  outcome: string | null;
}

export interface AnonymizedClosePool {
  region: string | null;
  naics3: string | null;
  industryShort: string | null;
  closeQuarter: string;
  salePriceBanded: number;
  revenueBanded: number;
  sdeBanded: number;
  sdeMultiple: number;
  outcome: string | null;
}

export function anonymizeCloseComp(record: ClosePoolRecord): AnonymizedClosePool {
  const salePriceBanded = roundMoney(record.salePrice);
  const sdeBanded = roundMoney(record.sde);
  return {
    region: record.region,
    naics3: record.naics === null ? null : naics3(record.naics),
    industryShort: record.industryShort,
    closeQuarter: fiscalQuarter(record.closeDate),
    salePriceBanded,
    revenueBanded: roundMoney(record.revenue),
    sdeBanded,
    sdeMultiple: salePriceBanded / sdeBanded,
    outcome: record.outcome,
  };
}

export interface CompPoolEligibilityInput {
  optedIn: boolean;
  outcomeReason: string | null;
  closeDate: string;
  asOf: string;
}

function quartersBetween(from: string, to: string): number {
  const fromMonths = Number(from.slice(0, 4)) * 12 + (Number(from.slice(5, 7)) - 1);
  const toMonths = Number(to.slice(0, 4)) * 12 + (Number(to.slice(5, 7)) - 1);
  return (toMonths - fromMonths) / 3;
}

export function compPoolEligible(input: CompPoolEligibilityInput): boolean {
  if (!input.optedIn) {
    return false;
  }
  if (
    input.outcomeReason === 'lost_to_other_buyer' &&
    quartersBetween(input.closeDate, input.asOf) < 2
  ) {
    return false;
  }
  return true;
}

export interface ClosedDealRecord {
  state: string;
  naics: string;
  salePrice: number;
  revenue: number;
  sde: number;
  ebitda: number;
  structure: Record<string, number>;
  employees: number;
  businessAgeYears: number;
  serviceMix: Record<string, number>;
  cbsa: string | null;
}

export interface AnonymizedComp {
  pseudonym: string;
  state: string;
  industryShortName: string;
  salePrice: number;
  revenue: number;
  sde: number;
  ebitda: number;
  multPriceRevenue: number;
  multPriceSde: number;
  multPriceEbitda: number;
  structure: Record<string, number>;
  employeeBand: string;
  businessAgeBand: string;
  serviceMix: Record<string, number>;
  geography: string;
}

function roundStructure(structure: Record<string, number>): Record<string, number> {
  const rounded: Record<string, number> = {};
  for (const [key, share] of Object.entries(structure)) {
    rounded[key] = roundPercentTo5(share);
  }
  return rounded;
}

export function anonymizeClosedDeal(
  record: ClosedDealRecord,
  sequence: number,
): AnonymizedComp {
  const shortName = industryShortName(record.naics);
  const salePrice = roundMoney(record.salePrice);
  const revenue = roundMoney(record.revenue);
  const sde = roundMoney(record.sde);
  const ebitda = roundMoney(record.ebitda);

  return {
    pseudonym: generatePseudonym({ state: record.state, industryShortName: shortName, sequence }),
    state: record.state,
    industryShortName: shortName,
    salePrice,
    revenue,
    sde,
    ebitda,
    multPriceRevenue: salePrice / revenue,
    multPriceSde: salePrice / sde,
    multPriceEbitda: salePrice / ebitda,
    structure: roundStructure(record.structure),
    employeeBand: employeeBand(record.employees),
    businessAgeBand: businessAgeBand(record.businessAgeYears),
    serviceMix: roundServiceMix(record.serviceMix),
    geography: coarsenGeography(record.cbsa),
  };
}
