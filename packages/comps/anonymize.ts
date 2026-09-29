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
