import { z } from 'zod';

export const primaryAddbacksSchema = z.object({
  depreciation_amortization: z.number(),
  interest: z.number(),
  taxes: z.number(),
  owner_salary: z.number(),
  owner_payroll_taxes: z.number(),
});

export const customAddbackSchema = z.object({
  label: z.string(),
  amount: z.number(),
});

export const minorAddbacksSchema = z.object({
  non_working_family_salaries: z.number(),
  other_owner_salary_adjustments: z.number(),
  other_owner_payroll_taxes: z.number(),
  owner_auto_insurance_repairs: z.number(),
  donations: z.number(),
  fmv_rent_adjustment: z.number(),
  owner_insurance_premiums: z.number(),
  non_business_professional_services: z.number(),
  travel: z.number(),
  telephone: z.number(),
  maintenance_capex: z.number(),
  one_time_charges_or_income: z.number(),
  custom: z.array(customAddbackSchema),
});

export const sdePeriodSchema = z.object({
  weight: z.number(),
  months: z.number().int().min(1).max(11).nullish(),
  sales: z.number(),
  cogs: z.number(),
  opex: z.number(),
  primary: primaryAddbacksSchema,
  minor: minorAddbacksSchema,
});

export const sdePeriodsSchema = z.array(sdePeriodSchema).refine(
  (periods) =>
    Math.abs(periods.reduce((sum, period) => sum + period.weight, 0) - 1) <
    1e-6,
  { message: 'SDE period weights must sum to 1' },
);

export type PrimaryAddbacks = z.infer<typeof primaryAddbacksSchema>;
export type CustomAddback = z.infer<typeof customAddbackSchema>;
export type MinorAddbacks = z.infer<typeof minorAddbacksSchema>;
export type SdePeriod = z.infer<typeof sdePeriodSchema>;

export interface PeriodRecast {
  net_income: number;
  basic_discretionary_earnings: number;
  total_sde: number;
  margin: number | null;
  annualized_sde: number;
}

function sumPrimary(addbacks: PrimaryAddbacks): number {
  return (
    addbacks.depreciation_amortization +
    addbacks.interest +
    addbacks.taxes +
    addbacks.owner_salary +
    addbacks.owner_payroll_taxes
  );
}

function sumMinor(addbacks: MinorAddbacks): number {
  return (
    addbacks.non_working_family_salaries +
    addbacks.other_owner_salary_adjustments +
    addbacks.other_owner_payroll_taxes +
    addbacks.owner_auto_insurance_repairs +
    addbacks.donations +
    addbacks.fmv_rent_adjustment +
    addbacks.owner_insurance_premiums +
    addbacks.non_business_professional_services +
    addbacks.travel +
    addbacks.telephone +
    addbacks.maintenance_capex +
    addbacks.one_time_charges_or_income +
    addbacks.custom.reduce((total, row) => total + row.amount, 0)
  );
}

export function annualizeSde(
  totalSde: number,
  months: number | null | undefined,
): number {
  if (months == null || months <= 0) {
    return totalSde;
  }
  return Math.round((totalSde * 12) / months);
}

export function recastPeriod(period: SdePeriod): PeriodRecast {
  const netIncome = period.sales - period.cogs - period.opex;
  const basic = netIncome + sumPrimary(period.primary);
  const total = basic + sumMinor(period.minor);

  return {
    net_income: netIncome,
    basic_discretionary_earnings: basic,
    total_sde: total,
    margin: period.sales === 0 ? null : total / period.sales,
    annualized_sde: annualizeSde(total, period.months),
  };
}

export function weightedSde(periods: SdePeriod[]): number {
  const weighted = periods.reduce(
    (total, period) => total + recastPeriod(period).annualized_sde * period.weight,
    0,
  );
  return Math.round(weighted);
}
