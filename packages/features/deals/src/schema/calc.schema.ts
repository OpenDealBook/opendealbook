import { fundingSourceSchema } from '@odb/calculators';
import { z } from 'zod';

export const calcTypeSchema = z.enum(['sde', 'deal', 'working_capital']);

export type CalcType = z.infer<typeof calcTypeSchema>;

export const createCalcVersionSchema = z.object({
  deal_id: z.uuid(),
  type: calcTypeSchema,
  name: z.string().min(1).optional(),
  notes: z.string().optional(),
});

export type CreateCalcVersionPayload = z.infer<typeof createCalcVersionSchema>;

export const calcVersionIdSchema = z.object({
  calc_version_id: z.uuid(),
});

export type CalcVersionIdPayload = z.infer<typeof calcVersionIdSchema>;

export const sdeLineCodeSchema = z.enum([
  'sales',
  'cogs',
  'opex',
  'depreciation_amortization',
  'interest',
  'taxes',
  'owner_salary',
  'owner_payroll_taxes',
  'non_working_family_salaries',
  'other_owner_salary_adjustments',
  'other_owner_payroll_taxes',
  'owner_auto_insurance_repairs',
  'donations',
  'fmv_rent_adjustment',
  'owner_insurance_premiums',
  'non_business_professional_services',
  'travel',
  'telephone',
  'maintenance_capex',
  'one_time_charges_or_income',
  'custom',
]);

export type SdeLineCode = z.infer<typeof sdeLineCodeSchema>;

export const sdeLineSchema = z.object({
  line_code: sdeLineCodeSchema,
  custom_label: z.string().optional(),
  amount: z.number(),
});

export const sdePeriodInputSchema = z.object({
  label: z.string().optional(),
  weight: z.number(),
  months: z.number().int().min(1).max(11).nullish(),
  lines: z.array(sdeLineSchema),
});

export const saveSdeCalcSchema = z.object({
  calc_version_id: z.uuid(),
  periods: z.array(sdePeriodInputSchema),
});

export type SaveSdeCalcPayload = z.infer<typeof saveSdeCalcSchema>;

export const dealCalcInputsSchema = z.object({
  pl: z.object({
    sales: z.number(),
    cogs: z.number(),
    opex: z.number(),
    depreciation_amortization: z.number(),
    taxes: z.number(),
    interest: z.number(),
    owner_benefits: z.number(),
  }),
  purchase_price: z.number(),
  closing_costs: z.number().default(0),
  working_capital: z.number().optional(),
  annual_growth: z.number().default(0),
  required_personal_cash_flow: z.number().default(0),
  dscr_mode: z.enum(['tax_adjusted', 'sba_standard']).optional(),
  tax_rate: z.number().optional(),
  owner_salary: z.number().optional(),
  reference_line: z.number().optional(),
  buyer_equity: z.number().optional(),
});

export type DealCalcInputs = z.infer<typeof dealCalcInputsSchema>;

export const saveDealCalcSchema = z.object({
  calc_version_id: z.uuid(),
  inputs: dealCalcInputsSchema,
  funding_sources: z.array(fundingSourceSchema),
  deal_box_id: z.uuid().optional(),
  imported_from_version_id: z.uuid().optional(),
});

export type SaveDealCalcPayload = z.infer<typeof saveDealCalcSchema>;

export const saveWorkingCapitalCalcSchema = z.object({
  calc_version_id: z.uuid(),
  current_assets: z.number(),
  current_liabilities: z.number(),
  avg_monthly_revenue: z.number(),
});

export type SaveWorkingCapitalCalcPayload = z.infer<
  typeof saveWorkingCapitalCalcSchema
>;

export const adoptCalcVersionSchema = z.object({
  deal_id: z.uuid(),
  calc_version_id: z.uuid(),
});

export type AdoptCalcVersionPayload = z.infer<typeof adoptCalcVersionSchema>;
