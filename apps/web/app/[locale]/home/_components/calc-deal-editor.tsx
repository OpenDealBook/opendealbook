'use client';

import { type ReactNode, useMemo, useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import {
  type DscrOptions,
  type FundingSource,
  type ProfitAndLoss,
  cashOnCash,
  dealBoxGap,
  debtServiceYear1,
  deriveBuyerEquity,
  dscr,
  dscrSensitivity,
  netCashFlow,
  netIncome,
  paybackYears,
  proForma,
  purchaseMultiple,
  sdeFromPl,
} from '@odb/calculators';
import type { DealCalcInputs } from '@odb/deals/schema';
import { saveDealCalc } from '@odb/deals/server';
import { Button } from '@odb/ui/button';
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

import {
  type DealDraft,
  type FundingDraft,
  FUNDING_TYPE_OPTIONS,
  NumberField,
  money,
  num,
  pctText,
  pctToDecimal,
  ratio,
} from './calc-shared';

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
  };
}

export function CalcDealEditor(props: {
  calcVersionId: string;
  initial: DealDraft;
  sdeVersions: { id: string; name: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<DealDraft>(props.initial);

  function set(change: Partial<DealDraft>) {
    setDraft((current) => ({ ...current, ...change }));
  }

  const computed = useMemo(() => {
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
    const debtService = debtServiceYear1(funding);
    const ncf = netCashFlow(sde, debtService);
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
      dscr: dscr(sde, debtService, options),
      purchase_multiple: purchaseMultiple(
        num(draft.purchase_price),
        num(draft.closing_costs),
        sde,
      ),
      buyer_equity: buyerEquity,
      cash_on_cash: cashOnCash(ncf, buyerEquity),
      payback_years: paybackYears(buyerEquity, ncf),
      deal_box_gap: dealBoxGap(ncf, num(draft.required_personal_cash_flow)),
      pro_forma: proForma(sde, growth, debtService),
      dscr_sensitivity: dscrSensitivity(sde, debtService, options, reference),
      reference,
    };
  }, [draft]);

  function save() {
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
    };
    startTransition(async () => {
      await saveDealCalc({
        calc_version_id: props.calcVersionId,
        inputs,
        funding_sources: draft.funding.map(toFundingSource),
        imported_from_version_id:
          draft.imported_from_version_id.trim() === ''
            ? undefined
            : draft.imported_from_version_id,
      });
      router.refresh();
      props.onClose();
    });
  }

  return (
    <div className={'flex flex-col gap-6'}>
      <Section title={'Profit and loss'}>
        <NumberInput label={'Sales'} value={draft.sales} onChange={(v) => set({ sales: v })} />
        <NumberInput label={'COGS'} value={draft.cogs} onChange={(v) => set({ cogs: v })} />
        <NumberInput label={'Operating expenses'} value={draft.opex} onChange={(v) => set({ opex: v })} />
        <NumberInput label={'Depreciation and amortization'} value={draft.depreciation_amortization} onChange={(v) => set({ depreciation_amortization: v })} />
        <NumberInput label={'Taxes'} value={draft.taxes} onChange={(v) => set({ taxes: v })} />
        <NumberInput label={'Interest'} value={draft.interest} onChange={(v) => set({ interest: v })} />
        <NumberInput label={'Owner benefits'} value={draft.owner_benefits} onChange={(v) => set({ owner_benefits: v })} />
      </Section>

      <Section title={'Deal terms'}>
        <NumberInput label={'Purchase price'} value={draft.purchase_price} onChange={(v) => set({ purchase_price: v })} />
        <NumberInput label={'Closing costs'} value={draft.closing_costs} onChange={(v) => set({ closing_costs: v })} />
        <NumberInput label={'Working capital'} value={draft.working_capital} onChange={(v) => set({ working_capital: v })} />
        <NumberInput label={'Annual growth (%)'} value={draft.annual_growth} onChange={(v) => set({ annual_growth: v })} />
        <NumberInput label={'DSCR tax rate (%)'} value={draft.tax_rate} onChange={(v) => set({ tax_rate: v })} />
        <NumberInput label={'Buyer equity override'} value={draft.buyer_equity} onChange={(v) => set({ buyer_equity: v })} />
      </Section>

      <Section title={'Deal box'}>
        <NumberInput label={'Required personal cash flow'} value={draft.required_personal_cash_flow} onChange={(v) => set({ required_personal_cash_flow: v })} />
        <NumberInput label={'Minimum DSCR'} value={draft.reference_line} onChange={(v) => set({ reference_line: v })} />
      </Section>

      <div className={'flex flex-col gap-1'}>
        <Label>Import from SDE version</Label>
        <Select
          value={draft.imported_from_version_id === '' ? 'none' : draft.imported_from_version_id}
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
        onChange={(funding) => set({ funding })}
      />

      <div className={'flex flex-col gap-4 border-t pt-4'}>
        <h3 className={'text-sm font-semibold'}>Computed outputs</h3>
        <dl className={'grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3'}>
          <Output label={'Net income'} value={money(computed.net_income)} />
          <Output label={'SDE'} value={money(computed.sde)} />
          <Output label={'Loan payment / debt service yr1'} value={money(computed.debt_service_yr1)} />
          <Output label={'Net cash flow'} value={money(computed.net_cash_flow)} />
          <Output label={'DSCR (tax adjusted)'} value={ratio(computed.dscr)} />
          <Output label={'Purchase multiple'} value={ratio(computed.purchase_multiple)} />
          <Output label={'Cash on cash'} value={pctText(computed.cash_on_cash)} />
          <Output label={'Payback years'} value={computed.payback_years == null ? 'n/a' : String(computed.payback_years)} />
          <Output label={'Buyer equity'} value={money(computed.buyer_equity)} />
          <Output label={'Deal box gap'} value={money(computed.deal_box_gap)} />
        </dl>

        <div>
          <h4 className={'text-muted-foreground mb-1 text-xs font-semibold uppercase'}>Pro forma (years 1-10)</h4>
          <div className={'flex flex-wrap gap-2 text-sm'}>
            {computed.pro_forma.map((value, index) => (
              <span key={index} className={'rounded border px-2 py-1'}>
                Yr {index + 1}: {money(value)}
              </span>
            ))}
          </div>
        </div>

        <div>
          <h4 className={'text-muted-foreground mb-1 text-xs font-semibold uppercase'}>
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
                  <TableCell>{point.meets_reference ? 'Yes' : 'No'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className={'flex justify-end gap-2 border-t pt-4'}>
        <Button variant={'outline'} size={'sm'} onClick={props.onClose}>
          Cancel
        </Button>
        <Button size={'sm'} disabled={pending} onClick={save}>
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
      <div className={'grid grid-cols-2 gap-4 sm:grid-cols-3'}>{props.children}</div>
    </div>
  );
}

function NumberInput(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className={'flex flex-col gap-1'}>
      <Label>{props.label}</Label>
      <NumberField value={props.value} placeholder={'0'} onChange={props.onChange} />
    </div>
  );
}

function Output(props: { label: string; value: string }) {
  return (
    <div className={'flex flex-col gap-0.5'}>
      <dt className={'text-muted-foreground text-xs uppercase'}>{props.label}</dt>
      <dd className={'text-sm font-medium'}>{props.value}</dd>
    </div>
  );
}

function FundingEditor(props: {
  funding: FundingDraft[];
  onChange: (funding: FundingDraft[]) => void;
}) {
  function update(index: number, change: Partial<FundingDraft>) {
    props.onChange(
      props.funding.map((row, i) => (i === index ? { ...row, ...change } : row)),
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
              {
                id: crypto.randomUUID(),
                type: 'sba_7a',
                amount: '',
                rate: '',
                term_years: '',
                standby_months: '',
              },
            ])
          }
        >
          Add source
        </Button>
      </div>
      {props.funding.length === 0 ? (
        <p className={'text-muted-foreground text-sm'}>No funding sources</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Rate (%)</TableHead>
              <TableHead>Term (years)</TableHead>
              <TableHead>Standby (months)</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {props.funding.map((row, index) => (
              <TableRow key={row.id}>
                <TableCell>
                  <Select
                    value={row.type}
                    onValueChange={(value) =>
                      update(index, { type: value as FundingDraft['type'] })
                    }
                  >
                    <SelectTrigger className={'w-40'}>
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
                </TableCell>
                <TableCell>
                  <NumberField value={row.amount} placeholder={'0'} onChange={(v) => update(index, { amount: v })} />
                </TableCell>
                <TableCell>
                  <NumberField value={row.rate} placeholder={'0'} onChange={(v) => update(index, { rate: v })} />
                </TableCell>
                <TableCell>
                  <NumberField value={row.term_years} placeholder={'0'} onChange={(v) => update(index, { term_years: v })} />
                </TableCell>
                <TableCell>
                  <NumberField value={row.standby_months} placeholder={'0'} onChange={(v) => update(index, { standby_months: v })} />
                </TableCell>
                <TableCell>
                  <Button
                    variant={'ghost'}
                    size={'sm'}
                    onClick={() =>
                      props.onChange(props.funding.filter((_r, i) => i !== index))
                    }
                  >
                    Remove
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
