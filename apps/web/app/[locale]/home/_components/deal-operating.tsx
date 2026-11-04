'use client';

import { useState } from 'react';

import { useLocale } from 'next-intl';

import { saveDealOperatingPeriod } from '@odb/deals/server';
import type { OperatingSummary, OperatingVariance } from '@odb/deals/shared';
import type { Tables } from '@odb/supabase';
import { Button } from '@odb/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@odb/ui/card';
import { FigureValue, MissingValue } from '@odb/ui/figure-value';
import { MISSING_FIGURE, formatMoneyExact, formatMonth } from '@odb/ui/format';
import { Input } from '@odb/ui/input';
import { Label } from '@odb/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@odb/ui/select';

import { trendBarHeights } from './deal-operating-trend';
import { useRefusableAction } from './use-refusable-action';

const NEW_MONTH = '__new__';

function SignedFigure(props: {
  value: number | null;
  format: 'money' | 'percent';
}) {
  return (
    <>
      {props.value !== null && props.value > 0 ? '+' : ''}
      <FigureValue calculated value={props.value} format={props.format} />
    </>
  );
}

function exactMoney(value: number | null): string {
  return value === null ? MISSING_FIGURE : formatMoneyExact(value);
}

function toNumber(value: string): number | undefined {
  const trimmed = value.trim();
  return trimmed === '' ? undefined : Number(trimmed);
}

function VarianceRow(props: { label: string; variance: OperatingVariance }) {
  return (
    <div className={'flex flex-col gap-1 rounded-md border p-3'}>
      <span className={'text-sm font-medium'}>{props.label}</span>
      <div className={'text-muted-foreground flex flex-wrap gap-4 text-sm'}>
        <span>
          Underwriting:{' '}
          <FigureValue value={props.variance.baseline} format={'money'} />
        </span>
        <span>
          Actual (annualized):{' '}
          <FigureValue
            calculated
            value={props.variance.actual}
            format={'money'}
          />
        </span>
        <span>
          Delta:{' '}
          <SignedFigure
            value={props.variance.absolute_delta}
            format={'money'}
          />
        </span>
        <span>
          <SignedFigure
            value={props.variance.percent_delta}
            format={'percent'}
          />
        </span>
      </div>
    </div>
  );
}

export function DealOperating(props: {
  dealId: string;
  accountId: string;
  periods: Tables<'deal_operating_period'>[];
  summary: OperatingSummary;
}) {
  const { refusal, pending, run } = useRefusableAction();
  const locale = useLocale();

  const [selectedMonth, setSelectedMonth] = useState(NEW_MONTH);
  const [periodMonth, setPeriodMonth] = useState('');
  const [revenue, setRevenue] = useState('');
  const [cogs, setCogs] = useState('');
  const [opex, setOpex] = useState('');
  const [cashBalance, setCashBalance] = useState('');
  const [headcount, setHeadcount] = useState('');

  function selectMonth(value: string) {
    setSelectedMonth(value);

    if (value === NEW_MONTH) {
      setPeriodMonth('');
      setRevenue('');
      setCogs('');
      setOpex('');
      setCashBalance('');
      setHeadcount('');
      return;
    }

    const period = props.periods.find((row) => row.period_month === value);

    if (!period) {
      return;
    }

    setPeriodMonth(period.period_month.slice(0, 7));
    setRevenue(period.revenue?.toString() ?? '');
    setCogs(period.cogs?.toString() ?? '');
    setOpex(period.opex?.toString() ?? '');
    setCashBalance(period.cash_balance?.toString() ?? '');
    setHeadcount(period.headcount?.toString() ?? '');
  }

  function save() {
    if (periodMonth.trim() === '') {
      return;
    }

    run(() =>
      saveDealOperatingPeriod({
        deal_id: props.dealId,
        period_month: `${periodMonth}-01`,
        revenue: toNumber(revenue),
        cogs: toNumber(cogs),
        opex: toNumber(opex),
        cash_balance: toNumber(cashBalance),
        headcount: toNumber(headcount),
      }),
    );
  }

  const latest = props.summary.latest;
  const latestRaw = props.periods.at(-1) ?? null;

  const revenueHeights = trendBarHeights(
    props.summary.periods.map((period) => period.revenue),
  );
  const noiHeights = trendBarHeights(
    props.summary.periods.map((period) => period.net_operating_income),
  );

  return (
    <div className={'flex flex-col gap-6'}>
      <div className={'grid grid-cols-2 gap-4 sm:grid-cols-5'}>
        <Card>
          <CardHeader>
            <CardTitle className={'text-muted-foreground text-sm'}>
              Revenue
            </CardTitle>
          </CardHeader>
          <CardContent className={'text-xl font-semibold'}>
            <FigureValue value={latest?.revenue ?? null} format={'money'} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className={'text-muted-foreground text-sm'}>
              Net operating income
            </CardTitle>
          </CardHeader>
          <CardContent className={'text-xl font-semibold'}>
            <FigureValue
              calculated
              value={latest?.net_operating_income ?? null}
              format={'money'}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className={'text-muted-foreground text-sm'}>
              Operating margin
            </CardTitle>
          </CardHeader>
          <CardContent className={'text-xl font-semibold'}>
            <FigureValue
              calculated
              value={latest?.operating_margin ?? null}
              format={'percent'}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className={'text-muted-foreground text-sm'}>
              Cash balance
            </CardTitle>
          </CardHeader>
          <CardContent className={'text-xl font-semibold'}>
            <FigureValue
              value={latestRaw?.cash_balance ?? null}
              format={'money'}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className={'text-muted-foreground text-sm'}>
              Headcount
            </CardTitle>
          </CardHeader>
          <CardContent className={'text-xl font-semibold'}>
            {latestRaw?.headcount ?? <MissingValue />}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Monthly trend</CardTitle>
        </CardHeader>
        <CardContent>
          {props.summary.periods.length === 0 ? (
            <p className={'text-muted-foreground text-sm'}>
              No operating periods recorded yet
            </p>
          ) : (
            <div className={'flex items-end gap-4 overflow-x-auto'}>
              {props.summary.periods.map((period, index) => (
                <div
                  key={period.period_month}
                  className={'flex flex-col items-center gap-1'}
                >
                  <div className={'flex h-24 items-end gap-1'}>
                    <div
                      className={'bg-primary w-3 rounded-t'}
                      style={{ height: `${revenueHeights[index] ?? 0}%` }}
                      title={`Revenue: ${exactMoney(period.revenue)}`}
                    />
                    <div
                      className={'bg-muted-foreground w-3 rounded-t'}
                      style={{ height: `${noiHeights[index] ?? 0}%` }}
                      title={`Net operating income: ${exactMoney(period.net_operating_income)}`}
                    />
                  </div>
                  <span className={'text-muted-foreground text-xs'}>
                    {formatMonth(period.period_month, locale)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Actual vs underwriting</CardTitle>
        </CardHeader>
        <CardContent className={'flex flex-col gap-3'}>
          <VarianceRow
            label={'Revenue'}
            variance={props.summary.variance.revenue}
          />
          <VarianceRow
            label={'Net operating income'}
            variance={props.summary.variance.net_operating_income}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add or edit a month</CardTitle>
        </CardHeader>
        <CardContent className={'flex flex-col gap-4'}>
          <div className={'flex flex-col gap-2'}>
            <Label htmlFor={'operating-month-select'}>Month</Label>
            <Select value={selectedMonth} onValueChange={selectMonth}>
              <SelectTrigger id={'operating-month-select'}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NEW_MONTH}>New month</SelectItem>
                {props.periods.map((period) => (
                  <SelectItem
                    key={period.period_month}
                    value={period.period_month}
                  >
                    {formatMonth(period.period_month, locale)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className={'grid grid-cols-2 gap-4 sm:grid-cols-3'}>
            <div className={'flex flex-col gap-2'}>
              <Label htmlFor={'operating-period-month'}>Period</Label>
              <Input
                id={'operating-period-month'}
                type={'month'}
                value={periodMonth}
                onChange={(event) => setPeriodMonth(event.target.value)}
              />
            </div>
            <div className={'flex flex-col gap-2'}>
              <Label htmlFor={'operating-revenue'}>Revenue</Label>
              <Input
                id={'operating-revenue'}
                type={'number'}
                value={revenue}
                onChange={(event) => setRevenue(event.target.value)}
              />
            </div>
            <div className={'flex flex-col gap-2'}>
              <Label htmlFor={'operating-cogs'}>COGS</Label>
              <Input
                id={'operating-cogs'}
                type={'number'}
                value={cogs}
                onChange={(event) => setCogs(event.target.value)}
              />
            </div>
            <div className={'flex flex-col gap-2'}>
              <Label htmlFor={'operating-opex'}>Operating expenses</Label>
              <Input
                id={'operating-opex'}
                type={'number'}
                value={opex}
                onChange={(event) => setOpex(event.target.value)}
              />
            </div>
            <div className={'flex flex-col gap-2'}>
              <Label htmlFor={'operating-cash-balance'}>Cash balance</Label>
              <Input
                id={'operating-cash-balance'}
                type={'number'}
                value={cashBalance}
                onChange={(event) => setCashBalance(event.target.value)}
              />
            </div>
            <div className={'flex flex-col gap-2'}>
              <Label htmlFor={'operating-headcount'}>Headcount</Label>
              <Input
                id={'operating-headcount'}
                type={'number'}
                value={headcount}
                onChange={(event) => setHeadcount(event.target.value)}
              />
            </div>
          </div>

          <Button
            disabled={pending || periodMonth.trim() === ''}
            onClick={save}
          >
            Save month
          </Button>
          {refusal ? (
            <p role={'alert'} className={'text-destructive text-sm'}>
              {refusal}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
