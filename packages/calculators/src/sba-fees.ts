export interface GuaranteeFeeTier {
  max_loan: number | null;
  guaranty_pct: number;
  fee_pct: number;
}

export interface SbaFeeSchedule {
  version: string;
  effective_date: string;
  tiers: GuaranteeFeeTier[];
}

export const REFERENCE_GUARANTEE_FEE_SCHEDULE: SbaFeeSchedule = {
  version: 'reference',
  effective_date: '2024-10-01',
  tiers: [{ max_loan: null, guaranty_pct: 0.75, fee_pct: 0.03 }],
};

export function computeGuaranteeFee(
  loanAmount: number,
  schedule: SbaFeeSchedule,
): number | null {
  const tier = schedule.tiers.find(
    (candidate) => candidate.max_loan == null || loanAmount <= candidate.max_loan,
  );
  if (tier === undefined) {
    return null;
  }
  return loanAmount * tier.guaranty_pct * tier.fee_pct;
}
