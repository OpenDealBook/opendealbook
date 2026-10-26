'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

import { useRouter } from 'next/navigation';

import {
  type AfterStandby,
  type FundingSourceType,
  type PathDrivers,
  type ScenarioPathDrivers,
  type SdePeriod,
  type YearBasis,
  afterStandbySchema,
  fundingSourceTypeSchema,
} from '@odb/calculators';
import type {
  DealCalcInputs,
  SaveSdeCalcPayload,
  SdeLineCode,
} from '@odb/deals/schema';
import type { fetchCalcVersion } from '@odb/deals/shared';
import { Button } from '@odb/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@odb/ui/dialog';
import { Input } from '@odb/ui/input';
import { Label } from '@odb/ui/label';

import type { DealCalcDefaults } from '../_lib/deal-calc-defaults';

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

export const SDE_LINE_GROUPS: { title: string; codes: ScalarSdeLineCode[] }[] =
  [
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

export { TYPE_LABELS, versionName } from './calc-version-name';

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
  id: string;
  label: string;
  weight: string;
  months: string;
  amounts: Partial<Record<ScalarSdeLineCode, string>>;
  custom: CustomLineDraft[];
}

export function emptySdePeriodDraft(weight: string): SdePeriodDraft {
  return {
    id: crypto.randomUUID(),
    label: '',
    weight,
    months: '',
    amounts: {},
    custom: [],
  };
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
): SaveSdeCalcPayload['periods'][number]['lines'] {
  return [
    ...SCALAR_CODES.flatMap((code) => {
      const entry = draft.amounts[code];
      return entry !== undefined && entry.trim() !== ''
        ? [{ line_code: code, amount: num(entry) }]
        : [];
    }),
    ...draft.custom.map((row) => ({
      id: row.id,
      line_code: 'custom' as const,
      custom_label: row.label,
      amount: num(row.amount),
    })),
  ];
}

interface SdeLineRow {
  id: string;
  line_code: string | null;
  custom_label: string | null;
  amount: number | null;
}

interface SdePeriodRow {
  id: string;
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
          id: line.id,
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
      id: row.id,
      label: row.label ?? '',
      weight: numberToString(row.weight),
      months: numberToString(row.months),
      amounts,
      custom,
    };
  });
}

export const FUNDING_TYPE_LABELS: Record<FundingSourceType, string> = {
  sba_7a: 'SBA 7(a)',
  sba_504: 'SBA 504',
  conventional: 'Conventional',
  seller_financing: 'Seller financing',
  cash_equity: 'Cash equity',
  heloc: 'HELOC',
  robs_401k: 'ROBS 401k',
  investor_equity: 'Investor equity',
  mezzanine: 'Mezzanine',
  other: 'Other',
};

export const FUNDING_TYPE_OPTIONS = fundingSourceTypeSchema.options.map(
  (value) => ({ value, label: FUNDING_TYPE_LABELS[value] }),
);

export const AFTER_STANDBY_LABELS: Record<AfterStandby, string> = {
  full_term_after_standby: 'Full term after standby',
  remaining_term: 'Remaining term',
};

export const YEAR_BASIS_LABELS: Record<YearBasis['kind'], string> = {
  months_from_close: 'Months from close',
  fiscal_year: 'Fiscal year',
};

export interface FundingDraft {
  id: string;
  type: FundingSourceType;
  amount: string;
  rate: string;
  term_years: string;
  standby_months: string;
  after_standby: AfterStandby;
}

export function newFundingDraft(afterStandby: AfterStandby): FundingDraft {
  return {
    id: crypto.randomUUID(),
    type: 'sba_7a',
    amount: '',
    rate: '',
    term_years: '',
    standby_months: '',
    after_standby: afterStandby,
  };
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
  year_basis: YearBasis['kind'];
  close_date: string;
  fiscal_year_end_month: string;
  scenario_paths: ScenarioPathsDraft;
}

export interface PathDriversDraft {
  revenue_loss: string;
  growth: string;
  margin_change: string;
  rate_shift: string;
}

interface ScenarioPathsDraft {
  worst: PathDriversDraft;
  great: PathDriversDraft;
}

function pathDriversDraft(drivers: PathDrivers): PathDriversDraft {
  return {
    revenue_loss: decimalToPctString(drivers.revenue_loss),
    growth: decimalToPctString(drivers.growth),
    margin_change: decimalToPctString(drivers.margin_change),
    rate_shift: decimalToPctString(drivers.rate_shift),
  };
}

export function scenarioPathsDraft(
  paths: ScenarioPathDrivers,
): ScenarioPathsDraft {
  return {
    worst: pathDriversDraft(paths.worst),
    great: pathDriversDraft(paths.great),
  };
}

function pathDriversFrom(draft: PathDriversDraft): PathDrivers {
  return {
    revenue_loss: pctToDecimal(draft.revenue_loss),
    growth: pctToDecimal(draft.growth),
    margin_change: pctToDecimal(draft.margin_change),
    rate_shift: pctToDecimal(draft.rate_shift),
  };
}

export function scenarioPathDriversFrom(
  draft: ScenarioPathsDraft,
): ScenarioPathDrivers {
  return {
    worst: pathDriversFrom(draft.worst),
    great: pathDriversFrom(draft.great),
  };
}

interface DealDraftDefaults {
  yearBasis: YearBasis['kind'];
  scenarioPaths: ScenarioPathDrivers;
  minimumDscr: number;
}

export function emptyDealDraft(defaults: DealDraftDefaults): DealDraft {
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
    reference_line: String(defaults.minimumDscr),
    buyer_equity: '',
    funding: [],
    imported_from_version_id: '',
    year_basis: defaults.yearBasis,
    close_date: '',
    fiscal_year_end_month: '',
    scenario_paths: scenarioPathsDraft(defaults.scenarioPaths),
  };
}

interface FundingRow {
  id: string;
  type: string | null;
  amount: number | null;
  rate: number | null;
  term_years: number | null;
  standby_months: number | null;
  after_standby: string | null;
}

export function dealDraftFromInputs(
  inputs: DealCalcInputs,
  funding: FundingRow[],
  importedFrom: string | null,
  defaultPaths: ScenarioPathDrivers,
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
      id: row.id,
      type: (row.type ?? 'other') as FundingSourceType,
      amount: numberToString(row.amount),
      rate: decimalToPctString(row.rate),
      term_years: numberToString(row.term_years),
      standby_months: numberToString(row.standby_months),
      after_standby: afterStandbySchema.parse(
        row.after_standby ?? 'full_term_after_standby',
      ),
    })),
    imported_from_version_id: importedFrom ?? '',
    ...yearBasisDraft(inputs.year_basis ?? { kind: 'months_from_close' }),
    scenario_paths: scenarioPathsDraft(inputs.scenario_paths ?? defaultPaths),
  };
}

function yearBasisDraft(
  basis: YearBasis,
): Pick<DealDraft, 'year_basis' | 'close_date' | 'fiscal_year_end_month'> {
  if (basis.kind === 'months_from_close') {
    return {
      year_basis: basis.kind,
      close_date: '',
      fiscal_year_end_month: '',
    };
  }
  return {
    year_basis: basis.kind,
    close_date: basis.close_date,
    fiscal_year_end_month: String(basis.fiscal_year_end_month),
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

export type CalcDetail = Awaited<ReturnType<typeof fetchCalcVersion>>;

export type CalcDraft =
  | { kind: 'sde'; periods: SdePeriodDraft[] }
  | { kind: 'deal'; draft: DealDraft }
  | { kind: 'working_capital'; draft: WorkingCapitalDraft };

export function calcDraftFromDetail(
  detail: CalcDetail,
  defaults: DealCalcDefaults,
): CalcDraft {
  const type = detail.version.type;
  if (type === 'sde') {
    return { kind: 'sde', periods: periodDraftsFromRows(detail.periods) };
  }
  if (type === 'deal') {
    const inputs = (detail.input?.inputs ?? null) as DealCalcInputs | null;
    return {
      kind: 'deal',
      draft:
        inputs == null
          ? emptyDealDraft(defaults)
          : dealDraftFromInputs(
              inputs,
              detail.funding_sources,
              detail.input?.imported_from_version_id ?? null,
              defaults.scenarioPaths,
            ),
    };
  }
  if (type === 'working_capital') {
    return {
      kind: 'working_capital',
      draft: workingCapitalDraftFromInputs(
        (detail.input?.inputs ?? {}) as {
          current_assets?: number;
          current_liabilities?: number;
          avg_monthly_revenue?: number;
        },
      ),
    };
  }
  throw new Error(`Unknown calc type ${type}`);
}

export function NumberField(props: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  className?: string;
  'aria-label'?: string;
}) {
  return (
    <Input
      id={props.id}
      type={'number'}
      value={props.value}
      placeholder={props.placeholder}
      className={props.className}
      aria-label={props['aria-label']}
      onChange={(event) => props.onChange(event.target.value)}
    />
  );
}

function groupDigits(value: string): string {
  const [whole, fraction] = value.split('.');
  const grouped = whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}

export function CurrencyField(props: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  'aria-label'?: string;
}) {
  return (
    <div className={'relative'}>
      <span
        aria-hidden={true}
        className={
          'text-muted-foreground pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm'
        }
      >
        $
      </span>
      <Input
        id={props.id}
        type={'text'}
        inputMode={'decimal'}
        className={'pl-6 tabular-nums'}
        value={groupDigits(props.value)}
        placeholder={props.placeholder}
        aria-label={props['aria-label']}
        onChange={(event) =>
          props.onChange(event.target.value.replace(/[^\d.-]/g, ''))
        }
      />
    </div>
  );
}

export function MoneyInput(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();

  return (
    <div className={'flex flex-col gap-1'}>
      <Label htmlFor={id}>{props.label}</Label>
      <CurrencyField
        id={id}
        value={props.value}
        placeholder={'0'}
        onChange={props.onChange}
      />
    </div>
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

type Leaving =
  | { kind: 'link'; anchor: HTMLAnchorElement }
  | { kind: 'back' }
  | { kind: 'discarded' };

function onGuardEntry(): boolean {
  return window.history.state?.unsavedGuard === true;
}

function pushGuardEntry() {
  window.history.pushState(
    { ...window.history.state, unsavedGuard: true },
    '',
    window.location.href,
  );
}

export function UnsavedChangesGuard({
  title = 'Discard unsaved changes?',
  description = 'Your edits to this calc have not been saved.',
  ...props
}: {
  dirty: boolean;
  title?: string;
  description?: string;
}) {
  const router = useRouter();
  const [leaving, setLeaving] = useState<Leaving | null>(null);
  const holding =
    props.dirty && leaving?.kind !== 'back' && leaving?.kind !== 'discarded';
  const holdingRef = useRef(holding);

  useLayoutEffect(() => {
    holdingRef.current = holding;
  }, [holding]);

  useEffect(() => {
    function holdLink(event: MouseEvent) {
      const anchor = (event.target as Element).closest('a');
      const opensElsewhere =
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.button !== 0 ||
        anchor?.target === '_blank';
      if (!holdingRef.current || anchor === null || opensElsewhere) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setLeaving({ kind: 'link', anchor });
    }

    document.addEventListener('click', holdLink, true);

    return () => document.removeEventListener('click', holdLink, true);
  }, []);

  function keepEditing() {
    if (leaving?.kind === 'back') {
      pushGuardEntry();
    }
    setLeaving(null);
  }

  function discard(target: Leaving) {
    if (target.kind === 'discarded') {
      return;
    }
    if (target.kind === 'back') {
      window.history.back();
      return;
    }
    const anchor = target.anchor;
    if (anchor.origin !== window.location.origin) {
      window.open(anchor.href, '_self');
      return;
    }
    const href = anchor.pathname + anchor.search + anchor.hash;
    if (!onGuardEntry()) {
      router.push(href);
      return;
    }
    setLeaving({ kind: 'discarded' });
    window.addEventListener('popstate', () => router.push(href), {
      once: true,
    });
    window.history.back();
  }

  useEffect(() => {
    if (!props.dirty && onGuardEntry()) {
      window.history.back();
    }
  }, [props.dirty]);

  useEffect(() => {
    if (!holding) {
      return;
    }

    if (!onGuardEntry()) {
      pushGuardEntry();
    }

    function holdUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }

    function holdBack() {
      setLeaving({ kind: 'back' });
    }

    window.addEventListener('beforeunload', holdUnload);
    window.addEventListener('popstate', holdBack);

    return () => {
      window.removeEventListener('beforeunload', holdUnload);
      window.removeEventListener('popstate', holdBack);
    };
  }, [holding]);

  return (
    <Dialog
      open={leaving !== null}
      onOpenChange={(open) => {
        if (!open) {
          keepEditing();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant={'outline'} onClick={keepEditing}>
            Keep editing
          </Button>
          <Button variant={'destructive'} onClick={() => discard(leaving!)}>
            Discard changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
