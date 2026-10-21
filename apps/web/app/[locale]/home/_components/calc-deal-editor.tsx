'use client';

import { type ReactNode, useId, useMemo, useState } from 'react';

import {
  type AfterStandby,
  type DscrOptions,
  type FundingSource,
  type ProjectedYear,
  type YearBasis,
  type ProfitAndLoss,
  cashOnCash,
  dealBoxGap,
  deriveBuyerEquity,
  afterStandbySchema,
  dscrSensitivity,
  fundingSourceSchema,
  netIncome,
  paybackYears,
  purchaseMultiple,
  scenarioPathDriversSchema,
  scenarioPaths,
  sdeFromPl,
  tenYearProForma,
  threeYearProjection,
  yearBasisKindSchema,
} from '@odb/calculators';
import type { DealCalcInputs } from '@odb/deals/schema';
import { saveDealCalc } from '@odb/deals/server';
import type { CalcSources } from '@odb/deals/shared';
import { Button } from '@odb/ui/button';
import { Input } from '@odb/ui/input';
import { Label } from '@odb/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@odb/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@odb/ui/table';

import { CitedField } from './calc-input-sources';
import {
  type DealDraft,
  type FundingDraft,
  AFTER_STANDBY_LABELS,
  FUNDING_TYPE_LABELS,
  FUNDING_TYPE_OPTIONS,
  CurrencyField,
  MoneyInput,
  NumberField,
  UnsavedChangesGuard,
  YEAR_BASIS_LABELS,
  money,
  newFundingDraft,
  scenarioPathDriversFrom,
  num,
  pctText,
  pctToDecimal,
  ratio,
} from './calc-shared';
import { PathDriversSection } from './path-drivers-section';
import { ScenarioPathsOutputs } from './scenario-paths-outputs';
import { useRefusableAction } from './use-refusable-action';

const DEAL_REFERENCE_LINE = 1.25;

function optionalNumber(value: string): number | undefined {
  return value.trim() === '' ? undefined : num(value);
}

function optionalDecimal(value: string): number | undefined {
  return value.trim() === '' ? undefined : pctToDecimal(value);
}

function toFundingSource(draft: FundingDraft): FundingSource {
  return {
    type: draft.type,
    amount: num(draft.amount),
    rate: optionalDecimal(draft.rate),
    term_years: optionalNumber(draft.term_years),
    standby_months: optionalNumber(draft.standby_months),
    after_standby: draft.after_standby,
  };
}

const FISCAL_YEAR_INCOMPLETE =
  'Fiscal year needs a close date and fiscal year end.';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function yearBasisFrom(draft: DealDraft): YearBasis | null {
  if (draft.year_basis === 'months_from_close') {
    return { kind: 'months_from_close' };
  }
  if (draft.close_date === '' || draft.fiscal_year_end_month === '') {
    return null;
  }
  return {
    kind: 'fiscal_year',
    close_date: draft.close_date,
    fiscal_year_end_month: num(draft.fiscal_year_end_month),
  };
}

export function CalcDealEditor(props: {
  calcVersionId: string;
  initial: DealDraft;
  sdeVersions: { id: string; name: ReactNode }[];
  defaultAfterStandby: AfterStandby;
  dealBox: { set: boolean; href: string };
  sources: CalcSources;
}) {
  const { refusal, pending, run } = useRefusableAction();
  const [draft, setDraft] = useState<DealDraft>(props.initial);
  const [pristine] = useState(draft);
  const [savedDraft, setSavedDraft] = useState<DealDraft | null>(null);
  const savedFunding = new Set(
    (savedDraft ?? props.initial).funding.map((source) => source.id),
  );

  function set(change: Partial<DealDraft>) {
    setDraft((current) => ({ ...current, ...change }));
  }

  const basis = yearBasisFrom(draft);
  const pathDrivers = useMemo(
    () =>
      scenarioPathDriversSchema.safeParse(
        scenarioPathDriversFrom(draft.scenario_paths),
      ),
    [draft.scenario_paths],
  );

  const computed = useMemo(() => {
    if (basis === null) {
      return null;
    }
    const pl: ProfitAndLoss = {
      sales: num(draft.sales),
      cogs: num(draft.cogs),
      opex: num(draft.opex),
      depreciation_amortization: num(draft.depreciation_amortization),
      taxes: num(draft.taxes),
      interest: num(draft.interest),
      owner_benefits: num(draft.owner_benefits),
    };
    const funding = draft.funding.map(toFundingSource);
    const options: DscrOptions = {
      mode: 'tax_adjusted',
      taxRate: optionalDecimal(draft.tax_rate),
    };
    const reference =
      draft.reference_line.trim() === ''
        ? DEAL_REFERENCE_LINE
        : num(draft.reference_line);
    const growth = pctToDecimal(draft.annual_growth);

    const sde = sdeFromPl(pl);
    const projection = {
      sde,
      annualGrowth: growth,
      sources: funding,
      dscrOptions: options,
      basis,
    };
    const years = threeYearProjection(projection);
    const debtService = years[0].debt_service;
    const ncf = years[0].net_cash_flow;
    const buyerEquity =
      draft.buyer_equity.trim() === ''
        ? deriveBuyerEquity({
            purchase_price: num(draft.purchase_price),
            closing_costs: num(draft.closing_costs),
            working_capital: optionalNumber(draft.working_capital),
            funding_sources: funding,
          })
        : num(draft.buyer_equity);

    return {
      net_income: netIncome(pl),
      sde,
      debt_service_yr1: debtService,
      net_cash_flow: ncf,
      dscr: years[0].dscr,
      years,
      purchase_multiple: purchaseMultiple(
        num(draft.purchase_price),
        num(draft.closing_costs),
        sde,
      ),
      buyer_equity: buyerEquity,
      cash_on_cash: cashOnCash(ncf, buyerEquity),
      payback_years: paybackYears(buyerEquity, ncf),
      deal_box_gap: dealBoxGap(ncf, num(draft.required_personal_cash_flow)),
      pro_forma: tenYearProForma(projection),
      paths: pathDrivers.success
        ? scenarioPaths({
            ...projection,
            sales: pl.sales,
            minimumDscr: reference,
            drivers: pathDrivers.data,
          })
        : null,
      dscr_sensitivity: dscrSensitivity(sde, debtService, options, reference),
      reference,
    };
  }, [draft, basis, pathDrivers]);

  const saveBlockers = [
    ...(basis === null ? [FISCAL_YEAR_INCOMPLETE] : []),
    ...(pathDrivers.error?.issues.map((issue) => issue.message) ?? []),
    ...new Set(
      draft.funding.flatMap(
        (loan) =>
          fundingSourceSchema
            .safeParse(toFundingSource(loan))
            .error?.issues.map((issue) => issue.message) ?? [],
      ),
    ),
  ];

  function save(yearBasis: YearBasis) {
    const saving = draft;
    const pl: ProfitAndLoss = {
      sales: num(draft.sales),
      cogs: num(draft.cogs),
      opex: num(draft.opex),
      depreciation_amortization: num(draft.depreciation_amortization),
      taxes: num(draft.taxes),
      interest: num(draft.interest),
      owner_benefits: num(draft.owner_benefits),
    };
    const inputs: DealCalcInputs = {
      pl,
      purchase_price: num(draft.purchase_price),
      closing_costs: num(draft.closing_costs),
      working_capital: optionalNumber(draft.working_capital),
      annual_growth: pctToDecimal(draft.annual_growth),
      required_personal_cash_flow: num(draft.required_personal_cash_flow),
      dscr_mode: 'tax_adjusted',
      tax_rate: optionalDecimal(draft.tax_rate),
      reference_line:
        draft.reference_line.trim() === ''
          ? DEAL_REFERENCE_LINE
          : num(draft.reference_line),
      buyer_equity: optionalNumber(draft.buyer_equity),
      year_basis: yearBasis,
      scenario_paths: scenarioPathDriversFrom(draft.scenario_paths),
    };
    run(
      () =>
        saveDealCalc({
          calc_version_id: props.calcVersionId,
          inputs,
          funding_sources: draft.funding.map((source) => ({
            id: source.id,
            ...toFundingSource(source),
          })),
          imported_from_version_id:
            draft.imported_from_version_id.trim() === ''
              ? undefined
              : draft.imported_from_version_id,
        }),
      () => setSavedDraft(saving),
    );
  }

  return (
    <div className={'flex flex-col gap-6'}>
      <UnsavedChangesGuard dirty={draft !== (savedDraft ?? pristine)} />
      <Section title={'Profit and loss'}>
        <CitedField
          sources={props.sources}
          input={{ rowId: null, field: 'sales' }}
          label={'Sales'}
        >
          <MoneyInput
            label={'Sales'}
            value={draft.sales}
            onChange={(v) => set({ sales: v })}
          />
        </CitedField>
        <CitedField
          sources={props.sources}
          input={{ rowId: null, field: 'cogs' }}
          label={'COGS'}
        >
          <MoneyInput
            label={'COGS'}
            value={draft.cogs}
            onChange={(v) => set({ cogs: v })}
          />
        </CitedField>
        <CitedField
          sources={props.sources}
          input={{ rowId: null, field: 'opex' }}
          label={'Operating expenses'}
        >
          <MoneyInput
            label={'Operating expenses'}
            value={draft.opex}
            onChange={(v) => set({ opex: v })}
          />
        </CitedField>
        <CitedField
          sources={props.sources}
          input={{ rowId: null, field: 'depreciation_amortization' }}
          label={'Depreciation and amortization'}
        >
          <MoneyInput
            label={'Depreciation and amortization'}
            value={draft.depreciation_amortization}
            onChange={(v) => set({ depreciation_amortization: v })}
          />
        </CitedField>
        <CitedField
          sources={props.sources}
          input={{ rowId: null, field: 'taxes' }}
          label={'Taxes'}
        >
          <MoneyInput
            label={'Taxes'}
            value={draft.taxes}
            onChange={(v) => set({ taxes: v })}
          />
        </CitedField>
        <CitedField
          sources={props.sources}
          input={{ rowId: null, field: 'interest' }}
          label={'Interest'}
        >
          <MoneyInput
            label={'Interest'}
            value={draft.interest}
            onChange={(v) => set({ interest: v })}
          />
        </CitedField>
        <CitedField
          sources={props.sources}
          input={{ rowId: null, field: 'owner_benefits' }}
          label={'Owner benefits'}
        >
          <MoneyInput
            label={'Owner benefits'}
            value={draft.owner_benefits}
            onChange={(v) => set({ owner_benefits: v })}
          />
        </CitedField>
      </Section>

      <Section title={'Deal terms'}>
        <CitedField
          sources={props.sources}
          input={{ rowId: null, field: 'purchase_price' }}
          label={'Purchase price'}
        >
          <MoneyInput
            label={'Purchase price'}
            value={draft.purchase_price}
            onChange={(v) => set({ purchase_price: v })}
          />
        </CitedField>
        <CitedField
          sources={props.sources}
          input={{ rowId: null, field: 'closing_costs' }}
          label={'Closing costs'}
        >
          <MoneyInput
            label={'Closing costs'}
            value={draft.closing_costs}
            onChange={(v) => set({ closing_costs: v })}
          />
        </CitedField>
        <CitedField
          sources={props.sources}
          input={{ rowId: null, field: 'working_capital' }}
          label={'Working capital'}
        >
          <MoneyInput
            label={'Working capital'}
            value={draft.working_capital}
            onChange={(v) => set({ working_capital: v })}
          />
        </CitedField>
        <CitedField
          sources={props.sources}
          input={{ rowId: null, field: 'annual_growth' }}
          label={'Annual growth (%)'}
        >
          <NumberInput
            label={'Annual growth (%)'}
            value={draft.annual_growth}
            onChange={(v) => set({ annual_growth: v })}
          />
        </CitedField>
        <CitedField
          sources={props.sources}
          input={{ rowId: null, field: 'tax_rate' }}
          label={'DSCR tax rate (%)'}
        >
          <NumberInput
            label={'DSCR tax rate (%)'}
            value={draft.tax_rate}
            onChange={(v) => set({ tax_rate: v })}
          />
        </CitedField>
        <CitedField
          sources={props.sources}
          input={{ rowId: null, field: 'buyer_equity' }}
          label={'Buyer equity override'}
        >
          <MoneyInput
            label={'Buyer equity override'}
            value={draft.buyer_equity}
            onChange={(v) => set({ buyer_equity: v })}
          />
        </CitedField>
      </Section>

      <Section title={'Deal box'}>
        <CitedField
          sources={props.sources}
          input={{ rowId: null, field: 'required_personal_cash_flow' }}
          label={'Required personal cash flow'}
        >
          <MoneyInput
            label={'Required personal cash flow'}
            value={draft.required_personal_cash_flow}
            onChange={(v) => set({ required_personal_cash_flow: v })}
          />
        </CitedField>
        <CitedField
          sources={props.sources}
          input={{ rowId: null, field: 'reference_line' }}
          label={'Minimum DSCR'}
        >
          <NumberInput
            label={'Minimum DSCR'}
            value={draft.reference_line}
            onChange={(v) => set({ reference_line: v })}
          />
        </CitedField>
      </Section>

      <Section title={'Years'}>
        <div className={'flex flex-col gap-1'}>
          <Label>Year basis</Label>
          <Select
            value={draft.year_basis}
            onValueChange={(value) =>
              set({ year_basis: yearBasisKindSchema.parse(value) })
            }
          >
            <SelectTrigger className={'w-48'}>
              <SelectValue>{YEAR_BASIS_LABELS[draft.year_basis]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {yearBasisKindSchema.options.map((value) => (
                <SelectItem key={value} value={value}>
                  {YEAR_BASIS_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {draft.year_basis === 'fiscal_year' && (
          <>
            <div className={'flex flex-col gap-1'}>
              <Label>Close date</Label>
              <Input
                type={'date'}
                value={draft.close_date}
                onChange={(event) => set({ close_date: event.target.value })}
              />
            </div>
            <div className={'flex flex-col gap-1'}>
              <Label>Fiscal year end</Label>
              <Select
                value={draft.fiscal_year_end_month}
                onValueChange={(value) => set({ fiscal_year_end_month: value })}
              >
                <SelectTrigger className={'w-48'}>
                  <SelectValue placeholder={'Month'} />
                </SelectTrigger>
                <SelectContent>
                  {MONTH_NAMES.map((name, index) => (
                    <SelectItem key={name} value={String(index + 1)}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        )}
      </Section>

      <PathDriversSection
        title={'Worst path'}
        citing={{ path: 'worst', sources: props.sources }}
        drivers={draft.scenario_paths.worst}
        onChange={(worst) =>
          set({ scenario_paths: { ...draft.scenario_paths, worst } })
        }
      />
      <PathDriversSection
        title={'Great path'}
        citing={{ path: 'great', sources: props.sources }}
        drivers={draft.scenario_paths.great}
        onChange={(great) =>
          set({ scenario_paths: { ...draft.scenario_paths, great } })
        }
      />

      <div className={'flex flex-col gap-1'}>
        <Label>Import from SDE version</Label>
        <Select
          value={
            draft.imported_from_version_id === ''
              ? 'none'
              : draft.imported_from_version_id
          }
          onValueChange={(value) =>
            set({ imported_from_version_id: value === 'none' ? '' : value })
          }
        >
          <SelectTrigger className={'w-72'}>
            <SelectValue placeholder={'None'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={'none'}>None</SelectItem>
            {props.sdeVersions.map((version) => (
              <SelectItem key={version.id} value={version.id}>
                {version.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <FundingEditor
        funding={draft.funding}
        defaultAfterStandby={props.defaultAfterStandby}
        sources={props.sources}
        savedFunding={savedFunding}
        onChange={(funding) => set({ funding })}
      />

      {saveBlockers.map((message) => (
        <p key={message} className={'text-destructive text-sm'}>
          {message}
        </p>
      ))}

      {computed !== null && (
        <div className={'flex flex-col gap-4 border-t pt-4'}>
          <h3 className={'text-sm font-semibold'}>Computed outputs</h3>
          <dl className={'grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3'}>
            <Output label={'Net income'} value={money(computed.net_income)} />
            <Output label={'SDE'} value={money(computed.sde)} />
            <Output
              label={'Loan payment / debt service yr1'}
              value={money(computed.debt_service_yr1)}
            />
            <Output
              label={'Net cash flow'}
              value={money(computed.net_cash_flow)}
            />
            <Output
              label={'DSCR (tax adjusted)'}
              value={ratio(computed.dscr)}
            />
            <Output
              label={'Purchase multiple incl. closing costs'}
              value={ratio(computed.purchase_multiple)}
            />
            <Output
              label={'Cash on cash'}
              value={pctText(computed.cash_on_cash)}
            />
            <Output
              label={'Payback years'}
              value={
                computed.payback_years == null
                  ? 'n/a'
                  : String(computed.payback_years)
              }
            />
            <Output
              label={'Buyer equity'}
              value={money(computed.buyer_equity)}
            />
            {props.dealBox.set ? (
              <Output
                label={'Deal box gap'}
                value={money(computed.deal_box_gap)}
              />
            ) : (
              <div className={'flex flex-col gap-0.5 text-sm'}>
                <a
                  href={props.dealBox.href}
                  className={'text-primary underline underline-offset-4'}
                >
                  Set your deal box to screen deals
                </a>
              </div>
            )}
          </dl>

          <YearsTable
            years={computed.years}
            sourceLabels={draft.funding.map(
              (loan) => FUNDING_TYPE_LABELS[loan.type],
            )}
          />

          <div>
            <h4
              className={
                'text-muted-foreground mb-1 text-xs font-semibold uppercase'
              }
            >
              Scenario paths
            </h4>
            {computed.paths !== null && (
              <ScenarioPathsOutputs result={computed.paths} />
            )}
          </div>

          <div>
            <h4
              className={
                'text-muted-foreground mb-1 text-xs font-semibold uppercase'
              }
            >
              Pro forma (years 1-10)
            </h4>
            <div className={'flex flex-wrap gap-2 text-sm'}>
              {computed.pro_forma.map((value, index) => (
                <span key={index} className={'rounded border px-2 py-1'}>
                  Yr {index + 1}: {money(value)}
                </span>
              ))}
            </div>
          </div>

          <div>
            <h4
              className={
                'text-muted-foreground mb-1 text-xs font-semibold uppercase'
              }
            >
              DSCR sensitivity vs {computed.reference.toFixed(2)}x line
            </h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SDE scale</TableHead>
                  <TableHead>SDE</TableHead>
                  <TableHead>DSCR</TableHead>
                  <TableHead>Meets reference</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {computed.dscr_sensitivity.map((point) => (
                  <TableRow key={point.scale}>
                    <TableCell>{`${point.scale >= 0 ? '+' : ''}${Math.round(point.scale * 100)}%`}</TableCell>
                    <TableCell>{money(point.sde)}</TableCell>
                    <TableCell>{ratio(point.dscr)}</TableCell>
                    <TableCell>
                      {point.meets_reference ? 'Yes' : 'No'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <div
        className={
          'flex flex-wrap items-center justify-end gap-2 border-t pt-4'
        }
      >
        {refusal ? (
          <p role={'alert'} className={'text-destructive text-sm'}>
            {refusal}
          </p>
        ) : null}
        <p role={'status'} className={'text-muted-foreground text-sm'}>
          {savedDraft === draft ? 'Saved' : null}
        </p>
        <Button
          size={'sm'}
          disabled={pending || saveBlockers.length > 0}
          onClick={basis === null ? undefined : () => save(basis)}
        >
          Save
        </Button>
      </div>
    </div>
  );
}

function Section(props: { title: string; children: ReactNode }) {
  return (
    <div className={'flex flex-col gap-2'}>
      <h3 className={'text-sm font-semibold'}>{props.title}</h3>
      <div className={'grid grid-cols-2 gap-4 sm:grid-cols-3'}>
        {props.children}
      </div>
    </div>
  );
}

function NumberInput(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();

  return (
    <div className={'flex flex-col gap-1'}>
      <Label htmlFor={id}>{props.label}</Label>
      <NumberField
        id={id}
        value={props.value}
        placeholder={'0'}
        onChange={props.onChange}
      />
    </div>
  );
}

function Output(props: { label: string; value: string }) {
  return (
    <div className={'flex flex-col gap-0.5'}>
      <dt className={'text-muted-foreground text-xs uppercase'}>
        {props.label}
      </dt>
      <dd className={'text-sm font-medium'}>{props.value}</dd>
    </div>
  );
}

function YearsTable(props: { years: ProjectedYear[]; sourceLabels: string[] }) {
  return (
    <div>
      <h4
        className={'text-muted-foreground mb-1 text-xs font-semibold uppercase'}
      >
        Years 1-3
      </h4>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead />
            {props.years.map((year) => (
              <TableHead key={year.year}>Yr {year.year}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {props.sourceLabels.map((label, index) => (
            <TableRow key={index}>
              <TableCell>{label}</TableCell>
              {props.years.map((year) => (
                <TableCell key={year.year}>
                  {money(year.debt_service_by_source[index])}
                </TableCell>
              ))}
            </TableRow>
          ))}
          <TableRow>
            <TableCell>Total debt service</TableCell>
            {props.years.map((year) => (
              <TableCell key={year.year}>{money(year.debt_service)}</TableCell>
            ))}
          </TableRow>
          <TableRow>
            <TableCell>SDE</TableCell>
            {props.years.map((year) => (
              <TableCell key={year.year}>{money(year.sde)}</TableCell>
            ))}
          </TableRow>
          <TableRow>
            <TableCell>DSCR</TableCell>
            {props.years.map((year) => (
              <TableCell key={year.year}>{ratio(year.dscr)}</TableCell>
            ))}
          </TableRow>
          <TableRow>
            <TableCell>Net cash flow</TableCell>
            {props.years.map((year) => (
              <TableCell key={year.year}>{money(year.net_cash_flow)}</TableCell>
            ))}
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}

function FundingEditor(props: {
  funding: FundingDraft[];
  defaultAfterStandby: AfterStandby;
  sources: CalcSources;
  savedFunding: Set<string>;
  onChange: (funding: FundingDraft[]) => void;
}) {
  function update(index: number, change: Partial<FundingDraft>) {
    props.onChange(
      props.funding.map((row, i) =>
        i === index ? { ...row, ...change } : row,
      ),
    );
  }

  return (
    <div className={'flex flex-col gap-2'}>
      <div className={'flex items-center justify-between'}>
        <h3 className={'text-sm font-semibold'}>Funding sources</h3>
        <Button
          variant={'outline'}
          size={'sm'}
          onClick={() =>
            props.onChange([
              ...props.funding,
              newFundingDraft(props.defaultAfterStandby),
            ])
          }
        >
          Add source
        </Button>
      </div>
      {props.funding.length === 0 ? (
        <p className={'text-muted-foreground text-sm'}>No funding sources</p>
      ) : (
        props.funding.map((row, index) => (
          <FundingSourceFields
            key={row.id}
            source={index + 1}
            row={row}
            sources={props.sources}
            unsaved={!props.savedFunding.has(row.id)}
            onChange={(change) => update(index, change)}
            onRemove={() =>
              props.onChange(props.funding.filter((_r, i) => i !== index))
            }
          />
        ))
      )}
    </div>
  );
}

function FundingSourceFields(props: {
  source: number;
  row: FundingDraft;
  sources: CalcSources;
  unsaved: boolean;
  onChange: (change: Partial<FundingDraft>) => void;
  onRemove: () => void;
}) {
  const id = useId();
  const name = `source ${props.source}`;

  return (
    <fieldset
      aria-label={`Source ${props.source}`}
      className={'flex flex-col gap-3 rounded-md border p-3'}
    >
      <div className={'flex items-center justify-between'}>
        <span className={'text-sm font-medium'}>Source {props.source}</span>
        <Button
          variant={'ghost'}
          size={'sm'}
          aria-label={`Remove source ${props.source}`}
          onClick={props.onRemove}
        >
          Remove
        </Button>
      </div>
      <div className={'grid grid-cols-2 gap-3 lg:grid-cols-3'}>
        <div className={'flex flex-col gap-1'}>
          <Label htmlFor={`${id}-type`}>Type</Label>
          <Select
            value={props.row.type}
            onValueChange={(value) =>
              props.onChange({ type: value as FundingDraft['type'] })
            }
          >
            <SelectTrigger
              id={`${id}-type`}
              aria-label={`Type, ${name}`}
              className={'w-full'}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FUNDING_TYPE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className={'flex flex-col gap-1'}>
          <Label htmlFor={`${id}-amount`}>Amount</Label>
          <CitedField
            sources={props.sources}
            unsaved={props.unsaved}
            input={{ rowId: props.row.id, field: 'amount' }}
            label={`Amount, ${name}`}
          >
            <CurrencyField
              id={`${id}-amount`}
              value={props.row.amount}
              placeholder={'0'}
              aria-label={`Amount, ${name}`}
              onChange={(v) => props.onChange({ amount: v })}
            />
          </CitedField>
        </div>
        <div className={'flex flex-col gap-1'}>
          <Label htmlFor={`${id}-rate`}>Rate (%)</Label>
          <CitedField
            sources={props.sources}
            unsaved={props.unsaved}
            input={{ rowId: props.row.id, field: 'rate' }}
            label={`Rate (%), ${name}`}
          >
            <NumberField
              id={`${id}-rate`}
              value={props.row.rate}
              placeholder={'0'}
              aria-label={`Rate (%), ${name}`}
              onChange={(v) => props.onChange({ rate: v })}
            />
          </CitedField>
        </div>
        <div className={'flex flex-col gap-1'}>
          <Label htmlFor={`${id}-term`}>Term (years)</Label>
          <CitedField
            sources={props.sources}
            unsaved={props.unsaved}
            input={{ rowId: props.row.id, field: 'term_years' }}
            label={`Term (years), ${name}`}
          >
            <NumberField
              id={`${id}-term`}
              value={props.row.term_years}
              placeholder={'0'}
              aria-label={`Term (years), ${name}`}
              onChange={(v) => props.onChange({ term_years: v })}
            />
          </CitedField>
        </div>
        <div className={'flex flex-col gap-1'}>
          <Label htmlFor={`${id}-standby`}>Standby (months)</Label>
          <CitedField
            sources={props.sources}
            unsaved={props.unsaved}
            input={{ rowId: props.row.id, field: 'standby_months' }}
            label={`Standby (months), ${name}`}
          >
            <NumberField
              id={`${id}-standby`}
              value={props.row.standby_months}
              placeholder={'0'}
              aria-label={`Standby (months), ${name}`}
              onChange={(v) => props.onChange({ standby_months: v })}
            />
          </CitedField>
        </div>
        <div className={'flex flex-col gap-1'}>
          <Label htmlFor={`${id}-after`}>After standby</Label>
          <Select
            value={props.row.after_standby}
            onValueChange={(value) =>
              props.onChange({ after_standby: afterStandbySchema.parse(value) })
            }
          >
            <SelectTrigger
              id={`${id}-after`}
              aria-label={`After standby, ${name}`}
              className={'w-full'}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {afterStandbySchema.options.map((value) => (
                <SelectItem key={value} value={value}>
                  {AFTER_STANDBY_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </fieldset>
  );
}
