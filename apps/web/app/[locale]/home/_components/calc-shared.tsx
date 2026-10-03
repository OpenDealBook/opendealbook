'use client';

import type { FundingSourceType, SdePeriod } from '@odb/calculators';
import type { DealCalcInputs, SdeLineCode } from '@odb/deals/schema';
import { Input } from '@odb/ui/input';

export type ScalarSdeLineCode = Exclude<SdeLineCode, 'custom'>;

export const SDE_LINE_LABELS: Record<ScalarSdeLineCode, string> = {
  sales: 'Sales',
  cogs: 'COGS',
  opex: 'Operating expenses',
  depreciation_amortization: 'Depreciation and amortization',
  interest: 'Interest',
  taxes: 'Taxes',
  owner_salary: 'Owner salary',
  owner_payroll_taxes: 'Owner payroll taxes',
  non_working_family_salaries: 'Non-working family salaries',
  other_owner_salary_adjustments: 'Other owner salary adjustments',
  other_owner_payroll_taxes: 'Other owner payroll taxes',
  owner_auto_insurance_repairs: 'Owner auto, insurance, repairs',
  donations: 'Donations',
  fmv_rent_adjustment: 'FMV rent adjustment',
  owner_insurance_premiums: 'Owner insurance premiums',
  non_business_professional_services: 'Non-business professional services',
  travel: 'Travel',
  telephone: 'Telephone',
  maintenance_capex: 'Maintenance capex',
  one_time_charges_or_income: 'One-time charges or income',
};

export const SDE_LINE_GROUPS: { title: string; codes: ScalarSdeLineCode[] }[] = [
  { title: 'Profit and loss', codes: ['sales', 'cogs', 'opex'] },
  {
    title: 'Primary addbacks',
    codes: [
      'depreciation_amortization',
      'interest',
      'taxes',
      'owner_salary',
      'owner_payroll_taxes',
    ],
  },
  {
    title: 'Minor addbacks',
    codes: [
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
    ],
  },
];

const SCALAR_CODES: ScalarSdeLineCode[] = SDE_LINE_GROUPS.flatMap(
  (group) => group.codes,
);

const currencyFmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

export function money(value: number | null | undefined): string {
  return value == null ? 'n/a' : currencyFmt.format(value);
}

export function ratio(value: number | null | undefined): string {
  return value == null ? 'n/a' : `${value.toFixed(2)}x`;
}

export function pctText(decimal: number | null | undefined): string {
  return decimal == null ? 'n/a' : `${(decimal * 100).toFixed(1)}%`;
}

export function num(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function pctToDecimal(value: string): number {
  return num(value) / 100;
}

export function decimalToPctString(value: number | null | undefined): string {
  if (value == null) {
    return '';
  }
  return String(Math.round(value * 1000) / 10);
}

export function numberToString(value: number | null | undefined): string {
  return value == null ? '' : String(value);
}

export interface CustomLineDraft {
  id: string;
  label: string;
  amount: string;
}

export interface SdePeriodDraft {
  label: string;
  weight: string;
  months: string;
  amounts: Partial<Record<ScalarSdeLineCode, string>>;
  custom: CustomLineDraft[];
}

export function emptySdePeriodDraft(weight: string): SdePeriodDraft {
  return { label: '', weight, months: '', amounts: {}, custom: [] };
}

export function buildSdePeriod(draft: SdePeriodDraft): SdePeriod {
  const get = (code: ScalarSdeLineCode) => num(draft.amounts[code] ?? '');
  return {
    weight: num(draft.weight),
    months: draft.months.trim() === '' ? null : num(draft.months),
    sales: get('sales'),
    cogs: get('cogs'),
    opex: get('opex'),
    primary: {
      depreciation_amortization: get('depreciation_amortization'),
      interest: get('interest'),
      taxes: get('taxes'),
      owner_salary: get('owner_salary'),
      owner_payroll_taxes: get('owner_payroll_taxes'),
    },
    minor: {
      non_working_family_salaries: get('non_working_family_salaries'),
      other_owner_salary_adjustments: get('other_owner_salary_adjustments'),
      other_owner_payroll_taxes: get('other_owner_payroll_taxes'),
      owner_auto_insurance_repairs: get('owner_auto_insurance_repairs'),
      donations: get('donations'),
      fmv_rent_adjustment: get('fmv_rent_adjustment'),
      owner_insurance_premiums: get('owner_insurance_premiums'),
      non_business_professional_services: get(
        'non_business_professional_services',
      ),
      travel: get('travel'),
      telephone: get('telephone'),
      maintenance_capex: get('maintenance_capex'),
      one_time_charges_or_income: get('one_time_charges_or_income'),
      custom: draft.custom.map((row) => ({
        label: row.label,
        amount: num(row.amount),
      })),
    },
  };
}

export function sdeLinesFromDraft(
  draft: SdePeriodDraft,
): { line_code: SdeLineCode; custom_label?: string; amount: number }[] {
  const lines: { line_code: SdeLineCode; custom_label?: string; amount: number }[] =
    [];
  for (const code of SCALAR_CODES) {
    const entry = draft.amounts[code];
    if (entry !== undefined && entry.trim() !== '') {
      lines.push({ line_code: code, amount: num(entry) });
    }
  }
  for (const row of draft.custom) {
    lines.push({
      line_code: 'custom',
      custom_label: row.label,
      amount: num(row.amount),
    });
  }
  return lines;
}

interface SdeLineRow {
  line_code: string | null;
  custom_label: string | null;
  amount: number | null;
}

interface SdePeriodRow {
  label: string | null;
  weight: number | null;
  months: number | null;
  created_at: string | null;
  sde_line: SdeLineRow[] | null;
}

export function periodDraftsFromRows(rows: SdePeriodRow[]): SdePeriodDraft[] {
  const ordered = [...rows].sort((a, b) =>
    (a.created_at ?? '').localeCompare(b.created_at ?? ''),
  );
  return ordered.map((row) => {
    const amounts: Partial<Record<ScalarSdeLineCode, string>> = {};
    const custom: CustomLineDraft[] = [];
    for (const line of row.sde_line ?? []) {
      if (line.line_code === 'custom') {
        custom.push({
          id: crypto.randomUUID(),
          label: line.custom_label ?? '',
          amount: numberToString(line.amount),
        });
      } else if (line.line_code != null) {
        amounts[line.line_code as ScalarSdeLineCode] = numberToString(
          line.amount,
        );
      }
    }
    return {
      label: row.label ?? '',
      weight: numberToString(row.weight),
      months: numberToString(row.months),
      amounts,
      custom,
    };
  });
}

export const FUNDING_TYPE_OPTIONS: { value: FundingSourceType; label: string }[] =
  [
    { value: 'sba_7a', label: 'SBA 7(a)' },
    { value: 'sba_504', label: 'SBA 504' },
    { value: 'conventional', label: 'Conventional' },
    { value: 'seller_financing', label: 'Seller financing' },
    { value: 'cash_equity', label: 'Cash equity' },
    { value: 'heloc', label: 'HELOC' },
    { value: 'robs_401k', label: 'ROBS 401k' },
    { value: 'investor_equity', label: 'Investor equity' },
    { value: 'mezzanine', label: 'Mezzanine' },
    { value: 'other', label: 'Other' },
  ];

export interface FundingDraft {
  id: string;
  type: FundingSourceType;
  amount: string;
  rate: string;
  term_years: string;
  standby_months: string;
}

export interface DealDraft {
  sales: string;
  cogs: string;
  opex: string;
  depreciation_amortization: string;
  taxes: string;
  interest: string;
  owner_benefits: string;
  purchase_price: string;
  closing_costs: string;
  working_capital: string;
  annual_growth: string;
  required_personal_cash_flow: string;
  tax_rate: string;
  reference_line: string;
  buyer_equity: string;
  funding: FundingDraft[];
  imported_from_version_id: string;
}

export function emptyDealDraft(): DealDraft {
  return {
    sales: '',
    cogs: '',
    opex: '',
    depreciation_amortization: '',
    taxes: '',
    interest: '',
    owner_benefits: '',
    purchase_price: '',
    closing_costs: '0',
    working_capital: '',
    annual_growth: '0',
    required_personal_cash_flow: '0',
    tax_rate: '',
    reference_line: '1.25',
    buyer_equity: '',
    funding: [],
    imported_from_version_id: '',
  };
}

interface FundingRow {
  type: string | null;
  amount: number | null;
  rate: number | null;
  term_years: number | null;
  standby_months: number | null;
}

export function dealDraftFromInputs(
  inputs: DealCalcInputs,
  funding: FundingRow[],
  importedFrom: string | null,
): DealDraft {
  return {
    sales: numberToString(inputs.pl.sales),
    cogs: numberToString(inputs.pl.cogs),
    opex: numberToString(inputs.pl.opex),
    depreciation_amortization: numberToString(
      inputs.pl.depreciation_amortization,
    ),
    taxes: numberToString(inputs.pl.taxes),
    interest: numberToString(inputs.pl.interest),
    owner_benefits: numberToString(inputs.pl.owner_benefits),
    purchase_price: numberToString(inputs.purchase_price),
    closing_costs: numberToString(inputs.closing_costs),
    working_capital: numberToString(inputs.working_capital),
    annual_growth: decimalToPctString(inputs.annual_growth),
    required_personal_cash_flow: numberToString(
      inputs.required_personal_cash_flow,
    ),
    tax_rate: decimalToPctString(inputs.tax_rate),
    reference_line: numberToString(inputs.reference_line ?? 1.25),
    buyer_equity: numberToString(inputs.buyer_equity),
    funding: funding.map((row) => ({
      id: crypto.randomUUID(),
      type: (row.type ?? 'other') as FundingSourceType,
      amount: numberToString(row.amount),
      rate: decimalToPctString(row.rate),
      term_years: numberToString(row.term_years),
      standby_months: numberToString(row.standby_months),
    })),
    imported_from_version_id: importedFrom ?? '',
  };
}

export interface WorkingCapitalDraft {
  current_assets: string;
  current_liabilities: string;
  avg_monthly_revenue: string;
}

export function emptyWorkingCapitalDraft(): WorkingCapitalDraft {
  return {
    current_assets: '',
    current_liabilities: '',
    avg_monthly_revenue: '',
  };
}

export function workingCapitalDraftFromInputs(inputs: {
  current_assets?: number;
  current_liabilities?: number;
  avg_monthly_revenue?: number;
}): WorkingCapitalDraft {
  return {
    current_assets: numberToString(inputs.current_assets),
    current_liabilities: numberToString(inputs.current_liabilities),
    avg_monthly_revenue: numberToString(inputs.avg_monthly_revenue),
  };
}

export function NumberField(props: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  'aria-label'?: string;
}) {
  return (
    <Input
      type={'number'}
      value={props.value}
      placeholder={props.placeholder}
      className={props.className}
      aria-label={props['aria-label']}
      onChange={(event) => props.onChange(event.target.value)}
    />
  );
}

export function TextField(props: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  'aria-label'?: string;
}) {
  return (
    <Input
      type={'text'}
      value={props.value}
      placeholder={props.placeholder}
      className={props.className}
      aria-label={props['aria-label']}
      onChange={(event) => props.onChange(event.target.value)}
    />
  );
}
