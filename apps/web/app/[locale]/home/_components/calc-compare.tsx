'use client';

import { Fragment, type ReactNode } from 'react';

import Link from 'next/link';

import type { CalcCitation } from '@odb/deals/shared';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@odb/ui/table';
import { cn } from '@odb/ui/utils';

import type { DealCalcDefaults } from '../_lib/deal-calc-defaults';
import { CitationList, type InputRef, citesInput } from './calc-citation-list';
import {
  type CalcDetail,
  type CalcDraft,
  type PathDriversDraft,
  AFTER_STANDBY_LABELS,
  FUNDING_TYPE_LABELS,
  SDE_LINE_GROUPS,
  SDE_LINE_LABELS,
  YEAR_BASIS_LABELS,
  calcDraftFromDetail,
  money,
  num,
  pctText,
  ratio,
  versionName,
} from './calc-shared';
import type { NamedVersion } from './calc-version-name';

interface Figure {
  group: string;
  label: string;
  value: string;
  cite?: InputRef;
}

interface CompareRow extends Figure {
  key: string;
  b: string;
  bCite?: InputRef;
  changed: boolean;
}

interface Snapshot {
  weighted_sde?: number;
  periods?: { total_sde: number; annualized_sde: number; margin: number }[];
  net_income?: number;
  sde?: number;
  debt_service_yr1?: number;
  net_cash_flow?: number;
  dscr?: number | null;
  purchase_multiple?: number | null;
  cash_on_cash?: number | null;
  payback_years?: number | null;
  buyer_equity?: number;
  deal_box_gap?: number;
  years?: {
    year: number;
    debt_service: number;
    dscr: number | null;
    net_cash_flow: number;
  }[];
  working_capital?: number;
  months_of_revenue_covered?: number | null;
}

function amount(value: string): string {
  return value.trim() === '' ? 'n/a' : money(num(value));
}

function percent(value: string): string {
  return value.trim() === '' ? 'n/a' : `${value}%`;
}

function text(value: string): string {
  return value.trim() === '' ? 'n/a' : value;
}

function pathFigures(
  group: string,
  path: 'worst' | 'great',
  drivers: PathDriversDraft,
): Figure[] {
  const cite = (field: keyof PathDriversDraft) => ({
    rowId: null,
    field: `${path}.${field}`,
  });

  return [
    {
      group,
      label: 'Revenue lost at close',
      value: percent(drivers.revenue_loss),
      cite: cite('revenue_loss'),
    },
    {
      group,
      label: 'Annual growth',
      value: percent(drivers.growth),
      cite: cite('growth'),
    },
    {
      group,
      label: 'SDE margin change',
      value:
        drivers.margin_change.trim() === ''
          ? 'n/a'
          : `${drivers.margin_change} pts`,
      cite: cite('margin_change'),
    },
    {
      group,
      label: 'Interest rate shift',
      value: percent(drivers.rate_shift),
      cite: cite('rate_shift'),
    },
  ];
}

function inputFigures(calc: CalcDraft): Figure[] {
  if (calc.kind === 'working_capital') {
    const group = 'Balance sheet';
    return [
      {
        group,
        label: 'Current assets',
        value: amount(calc.draft.current_assets),
        cite: { rowId: null, field: 'current_assets' },
      },
      {
        group,
        label: 'Current liabilities',
        value: amount(calc.draft.current_liabilities),
        cite: { rowId: null, field: 'current_liabilities' },
      },
      {
        group,
        label: 'Average monthly revenue',
        value: amount(calc.draft.avg_monthly_revenue),
        cite: { rowId: null, field: 'avg_monthly_revenue' },
      },
    ];
  }

  if (calc.kind === 'sde') {
    return calc.periods.flatMap((period, index) => {
      const group = `Period ${index + 1}`;
      return [
        { group, label: 'Label', value: text(period.label) },
        {
          group,
          label: 'Weight',
          value: text(period.weight),
          cite: { rowId: period.id, field: 'weight' },
        },
        {
          group,
          label: 'Months',
          value: text(period.months),
          cite: { rowId: period.id, field: 'months' },
        },
        ...SDE_LINE_GROUPS.flatMap((lines) => lines.codes)
          .filter((code) => (period.amounts[code] ?? '').trim() !== '')
          .map((code) => ({
            group,
            label: SDE_LINE_LABELS[code],
            value: amount(period.amounts[code]!),
            cite: { rowId: period.id, field: code },
          })),
        ...period.custom.map((line) => ({
          group,
          label: line.label,
          value: amount(line.amount),
          cite: { rowId: line.id, field: 'amount' },
        })),
      ];
    });
  }

  const draft = calc.draft;
  const pl = 'Profit and loss';
  const terms = 'Deal terms';
  const box = 'Deal box';
  const years = 'Years';

  return [
    {
      group: pl,
      label: 'Sales',
      value: amount(draft.sales),
      cite: { rowId: null, field: 'sales' },
    },
    {
      group: pl,
      label: 'COGS',
      value: amount(draft.cogs),
      cite: { rowId: null, field: 'cogs' },
    },
    {
      group: pl,
      label: 'Operating expenses',
      value: amount(draft.opex),
      cite: { rowId: null, field: 'opex' },
    },
    {
      group: pl,
      label: 'Depreciation and amortization',
      value: amount(draft.depreciation_amortization),
      cite: { rowId: null, field: 'depreciation_amortization' },
    },
    {
      group: pl,
      label: 'Taxes',
      value: amount(draft.taxes),
      cite: { rowId: null, field: 'taxes' },
    },
    {
      group: pl,
      label: 'Interest',
      value: amount(draft.interest),
      cite: { rowId: null, field: 'interest' },
    },
    {
      group: pl,
      label: 'Owner benefits',
      value: amount(draft.owner_benefits),
      cite: { rowId: null, field: 'owner_benefits' },
    },
    {
      group: terms,
      label: 'Purchase price',
      value: amount(draft.purchase_price),
      cite: { rowId: null, field: 'purchase_price' },
    },
    {
      group: terms,
      label: 'Closing costs',
      value: amount(draft.closing_costs),
      cite: { rowId: null, field: 'closing_costs' },
    },
    {
      group: terms,
      label: 'Working capital',
      value: amount(draft.working_capital),
      cite: { rowId: null, field: 'working_capital' },
    },
    {
      group: terms,
      label: 'Annual growth',
      value: percent(draft.annual_growth),
      cite: { rowId: null, field: 'annual_growth' },
    },
    {
      group: terms,
      label: 'DSCR tax rate',
      value: percent(draft.tax_rate),
      cite: { rowId: null, field: 'tax_rate' },
    },
    {
      group: terms,
      label: 'Buyer equity override',
      value: amount(draft.buyer_equity),
      cite: { rowId: null, field: 'buyer_equity' },
    },
    {
      group: box,
      label: 'Required personal cash flow',
      value: amount(draft.required_personal_cash_flow),
      cite: { rowId: null, field: 'required_personal_cash_flow' },
    },
    {
      group: box,
      label: 'Minimum DSCR',
      value: text(draft.reference_line),
      cite: { rowId: null, field: 'reference_line' },
    },
    {
      group: years,
      label: 'Year basis',
      value: YEAR_BASIS_LABELS[draft.year_basis],
    },
    { group: years, label: 'Close date', value: text(draft.close_date) },
    {
      group: years,
      label: 'Fiscal year end month',
      value: text(draft.fiscal_year_end_month),
    },
    ...pathFigures('Worst path', 'worst', draft.scenario_paths.worst),
    ...pathFigures('Great path', 'great', draft.scenario_paths.great),
    ...draft.funding.flatMap((loan, index) => {
      const group = 'Funding sources';
      const source = `source ${index + 1}`;
      return [
        {
          group,
          label: `Type, ${source}`,
          value: FUNDING_TYPE_LABELS[loan.type],
        },
        {
          group,
          label: `Amount, ${source}`,
          value: amount(loan.amount),
          cite: { rowId: loan.id, field: 'amount' },
        },
        {
          group,
          label: `Rate, ${source}`,
          value: percent(loan.rate),
          cite: { rowId: loan.id, field: 'rate' },
        },
        {
          group,
          label: `Term (years), ${source}`,
          value: text(loan.term_years),
          cite: { rowId: loan.id, field: 'term_years' },
        },
        {
          group,
          label: `Standby (months), ${source}`,
          value: text(loan.standby_months),
          cite: { rowId: loan.id, field: 'standby_months' },
        },
        {
          group,
          label: `After standby, ${source}`,
          value: AFTER_STANDBY_LABELS[loan.after_standby],
        },
      ];
    }),
  ];
}

function outputFigures(
  kind: CalcDraft['kind'],
  snapshot: Snapshot,
  dealBoxSet: boolean,
): Figure[] {
  if (kind === 'working_capital') {
    const group = 'Working capital';
    return [
      {
        group,
        label: 'Working capital',
        value: money(snapshot.working_capital),
      },
      {
        group,
        label: 'Months of revenue covered',
        value:
          snapshot.months_of_revenue_covered == null
            ? 'n/a'
            : snapshot.months_of_revenue_covered.toFixed(1),
      },
    ];
  }

  if (kind === 'sde') {
    return [
      {
        group: 'SDE',
        label: 'Weighted SDE',
        value: money(snapshot.weighted_sde),
      },
      ...(snapshot.periods ?? []).flatMap((period, index) => {
        const group = `Period ${index + 1}`;
        return [
          { group, label: 'Total SDE', value: money(period.total_sde) },
          {
            group,
            label: 'Annualized SDE',
            value: money(period.annualized_sde),
          },
          { group, label: 'Margin', value: pctText(period.margin) },
        ];
      }),
    ];
  }

  const group = 'Year 1';
  return [
    { group, label: 'Net income', value: money(snapshot.net_income) },
    { group, label: 'SDE', value: money(snapshot.sde) },
    {
      group,
      label: 'Loan payment / debt service yr1',
      value: money(snapshot.debt_service_yr1),
    },
    { group, label: 'Net cash flow', value: money(snapshot.net_cash_flow) },
    { group, label: 'DSCR (tax adjusted)', value: ratio(snapshot.dscr) },
    {
      group,
      label: 'Purchase multiple incl. closing costs',
      value: ratio(snapshot.purchase_multiple),
    },
    { group, label: 'Cash on cash', value: pctText(snapshot.cash_on_cash) },
    {
      group,
      label: 'Payback years',
      value:
        snapshot.payback_years == null ? 'n/a' : String(snapshot.payback_years),
    },
    { group, label: 'Buyer equity', value: money(snapshot.buyer_equity) },
    ...(dealBoxSet
      ? [{ group, label: 'Deal box gap', value: money(snapshot.deal_box_gap) }]
      : []),
    ...(snapshot.years ?? []).flatMap((year) => {
      const yearGroup = 'Years 1-3';
      const suffix = `yr${year.year}`;
      return [
        {
          group: yearGroup,
          label: `Debt service ${suffix}`,
          value: money(year.debt_service),
        },
        { group: yearGroup, label: `DSCR ${suffix}`, value: ratio(year.dscr) },
        {
          group: yearGroup,
          label: `Net cash flow ${suffix}`,
          value: money(year.net_cash_flow),
        },
      ];
    }),
  ];
}

function keyed(figures: Figure[]): Map<string, Figure> {
  const seen = new Map<string, number>();

  return new Map(
    figures.map((figure) => {
      const name = `${figure.group}\n${figure.label}`;
      const occurrence = seen.get(name) ?? 0;
      seen.set(name, occurrence + 1);
      return [`${name}\n${occurrence}`, figure];
    }),
  );
}

function citedBy(
  citations: CalcCitation[],
  input: InputRef | undefined,
): CalcCitation[] {
  return input === undefined
    ? []
    : citations.filter((citation) => citesInput(citation, input));
}

function sideBySide(a: Figure[], b: Figure[]): CompareRow[] {
  const aByKey = keyed(a);
  const bByKey = keyed(b);
  const rows = [
    ...[...aByKey].map(([key, figure]) => ({
      ...figure,
      key,
      b: bByKey.get(key)?.value ?? 'n/a',
      bCite: bByKey.get(key)?.cite,
    })),
    ...[...bByKey]
      .filter(([key]) => !aByKey.has(key))
      .map(([key, figure]) => ({
        ...figure,
        key,
        value: 'n/a',
        cite: undefined,
        b: figure.value,
        bCite: figure.cite,
      })),
  ];

  return rows.map((row) => ({ ...row, changed: row.value !== row.b }));
}

export function CalcCompare(props: {
  a: CalcDetail;
  b: CalcDetail;
  versions: NamedVersion[];
  defaults: DealCalcDefaults;
  dealBoxSet: boolean;
  calcsHref: string;
}) {
  const a = calcDraftFromDetail(props.a, props.defaults);
  const b = calcDraftFromDetail(props.b, props.defaults);
  const inputs = sideBySide(inputFigures(a), inputFigures(b));
  const outputs = sideBySide(
    outputFigures(
      a.kind,
      props.a.version.outputs_snapshot as Snapshot,
      props.dealBoxSet,
    ),
    outputFigures(
      b.kind,
      props.b.version.outputs_snapshot as Snapshot,
      props.dealBoxSet,
    ),
  );
  const href = (aId: string, bId: string) =>
    `${props.calcsHref}/compare?a=${aId}&b=${bId}`;

  return (
    <div className={'flex flex-col gap-6'}>
      <div className={'grid gap-4 md:grid-cols-2'}>
        <VersionPicker
          label={'Version A'}
          current={props.a.version.id}
          versions={props.versions.filter(
            (version) => version.id !== props.b.version.id,
          )}
          hrefFor={(id) => href(id, props.b.version.id)}
          nameOf={(version) => versionName(version, props.versions)}
        />
        <VersionPicker
          label={'Version B'}
          current={props.b.version.id}
          versions={props.versions.filter(
            (version) => version.id !== props.a.version.id,
          )}
          hrefFor={(id) => href(props.a.version.id, id)}
          nameOf={(version) => versionName(version, props.versions)}
        />
      </div>

      <CompareTable
        title={'Inputs'}
        rows={inputs}
        aName={versionName(props.a.version, props.versions)}
        bName={versionName(props.b.version, props.versions)}
        dealId={props.a.sources.dealId}
        aCitations={props.a.sources.citations}
        bCitations={props.b.sources.citations}
      />
      <CompareTable
        title={'Outputs'}
        rows={outputs}
        aName={versionName(props.a.version, props.versions)}
        bName={versionName(props.b.version, props.versions)}
        dealId={props.a.sources.dealId}
        aCitations={[]}
        bCitations={[]}
      />
    </div>
  );
}

function VersionPicker(props: {
  label: string;
  current: string;
  versions: NamedVersion[];
  hrefFor: (id: string) => string;
  nameOf: (version: NamedVersion) => ReactNode;
}) {
  return (
    <nav aria-label={props.label} className={'flex flex-col gap-2'}>
      <span className={'text-muted-foreground text-sm'}>{props.label}</span>
      <div className={'flex flex-wrap gap-2'}>
        {props.versions.map((version) => (
          <Link
            key={version.id}
            href={props.hrefFor(version.id)}
            aria-current={version.id === props.current ? 'page' : undefined}
            className={cn(
              'rounded-md border px-3 py-1 text-sm',
              version.id === props.current
                ? 'bg-primary text-primary-foreground border-primary'
                : 'hover:bg-accent',
            )}
          >
            {props.nameOf(version)}
          </Link>
        ))}
      </div>
    </nav>
  );
}

function CompareTable(props: {
  title: string;
  rows: CompareRow[];
  aName: ReactNode;
  bName: ReactNode;
  dealId: string;
  aCitations: CalcCitation[];
  bCitations: CalcCitation[];
}) {
  const changed = props.rows.filter((row) => row.changed).length;
  const groups = [...new Set(props.rows.map((row) => row.group))];

  return (
    <section className={'flex flex-col gap-2'}>
      <div className={'flex items-baseline justify-between gap-4'}>
        <h2 className={'text-base font-semibold'}>{props.title}</h2>
        <p className={'text-muted-foreground text-sm'}>
          {changed} of {props.rows.length} changed
        </p>
      </div>
      <div className={'rounded-md border'}>
        <Table aria-label={props.title} className={'table-fixed'}>
          <TableHeader>
            <TableRow>
              <TableHead className={'w-2/5'} />
              <TableHead className={'truncate'}>{props.aName}</TableHead>
              <TableHead className={'truncate'}>{props.bName}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((group) => (
              <Fragment key={group}>
                <TableRow className={'bg-muted/40 hover:bg-muted/40'}>
                  <TableHead
                    colSpan={3}
                    scope={'colgroup'}
                    className={'text-muted-foreground h-8 text-xs'}
                  >
                    {group}
                  </TableHead>
                </TableRow>
                {props.rows
                  .filter((row) => row.group === group)
                  .map((row) => (
                    <TableRow
                      key={row.key}
                      className={cn(
                        row.changed &&
                          'bg-warning/10 hover:bg-warning/15 font-medium',
                      )}
                    >
                      <TableCell
                        className={cn(
                          'whitespace-normal',
                          row.changed && 'border-warning border-l-4',
                        )}
                      >
                        <span>{row.label}</span>
                        {row.changed ? (
                          <span className={'sr-only'}> (changed)</span>
                        ) : null}
                      </TableCell>
                      <TableCell className={'whitespace-normal tabular-nums'}>
                        {row.value}
                        <CitationList
                          dealId={props.dealId}
                          citations={citedBy(props.aCitations, row.cite)}
                        />
                      </TableCell>
                      <TableCell className={'whitespace-normal tabular-nums'}>
                        {row.b}
                        <CitationList
                          dealId={props.dealId}
                          citations={citedBy(props.bCitations, row.bCite)}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
