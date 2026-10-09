export const SBA_LOAN_TO_PRICE_DEFAULT = 0.85;

export type SbaProgram = '7a' | '504';

export interface SbaCompFacts {
  program: SbaProgram;
  source: 'sba_foia';
  sourceLabel: 'SBA 7(a) FOIA' | 'SBA 504 FOIA';
  sourceRef: string;
  dataClass: 'external';
  priceBasis: 'loan_proxy';
  confidence: 'proxy';
  naicsCode: string;
  naicsDescription: string | null;
  city: string | null;
  state: string | null;
  price: number;
  approvalDate: string;
  termMonths: number | null;
  businessAge: string | null;
  lender: string | null;
  franchiseFlag: boolean;
}

export function deriveSbaPrice(input: {
  program: SbaProgram;
  grossApproval: number;
  thirdPartyDollars: number | null;
  ratio: number;
}): number | null {
  if (input.program === '7a') {
    return input.grossApproval / input.ratio;
  }
  if (input.thirdPartyDollars === null) {
    return null;
  }
  return input.grossApproval + input.thirdPartyDollars;
}

export function unionNaics(criteria: { naics?: string[] | null }[]): string[] {
  const codes = new Set<string>();
  for (const entry of criteria) {
    for (const code of entry.naics ?? []) {
      codes.add(code.trim());
    }
  }
  return [...codes];
}
