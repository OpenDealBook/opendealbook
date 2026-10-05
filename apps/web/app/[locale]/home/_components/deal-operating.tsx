'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { saveDealOperatingPeriod } from '@odb/deals/server';
import type { OperatingSummary, OperatingVariance } from '@odb/deals/shared';
import type { Tables } from '@odb/supabase';
import { Button } from '@odb/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@odb/ui/card';
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

const NO_DATA = 'No data';
const NEW_MONTH = '__new__';

function formatMoney(value: number | null): string {
  return value === null ? NO_DATA : `$${Math.round(value).toLocaleString('en-US')}`;
}

function formatPercent(value: number | null): string {
  return value === null ? NO_DATA : `${(value * 100).toFixed(1)}%`;
}

function formatSignedMoney(value: number | null): string {
  if (value === null) {
    return NO_DATA;
  }

  return `${value > 0 ? '+' : ''}$${Math.round(value).toLocaleString('en-US')}`;
}

function formatSignedPercent(value: number | null): string {
  if (value === null) {
    return NO_DATA;
  }

  return `${value > 0 ? '+' : ''}${(value * 100).toFixed(1)}%`;
}

function formatMonthLabel(periodMonth: string): string {
  return new Date(periodMonth).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  });
}

function toNumber(value: string): number | undefined {
  const trimmed = value.trim();
  return trimmed === '' ? undefined : Number(trimmed);
}

function VarianceRow(props: { label: string; variance: OperatingVariance }) {
  return (
    <div className={'flex flex-col gap-1 rounded-md border p-3'}>
      <span className={'text-sm font-medium'}>{props.label}</span>
      <div className={'flex flex-wrap gap-4 text-sm text-muted-foreground'}>
        <span>Underwriting: {formatMoney(props.variance.baseline)}</span>
        <span>Actual (annualized): {formatMoney(props.variance.actual)}</span>
        <span>Delta: {formatSignedMoney(props.variance.absolute_delta)}</span>
        <span>{formatSignedPercent(props.variance.percent_delta)}</span>
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
  const router = useRouter();
  const [pending, startTransition] = useTransition();

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

    startTransition(async () => {
      await saveDealOperatingPeriod({
        deal_id: props.dealId,
        period_month: `${periodMonth}-01`,
        revenue: toNumber(revenue),
        cogs: toNumber(cogs),
        opex: toNumber(opex),
        cash_balance: toNumber(cashBalance),
        headcount: toNumber(headcount),
      });
      router.refresh();
    });
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
            <CardTitle className={'text-sm text-muted-foreground'}>Revenue</CardTitle>
          </CardHeader>
          <CardContent className={'text-xl font-semibold'}>
            {formatMoney(latest?.revenue ?? null)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className={'text-sm text-muted-foreground'}>
              Net operating income
            </CardTitle>
          </CardHeader>
          <CardContent className={'text-xl font-semibold'}>
            {formatMoney(latest?.net_operating_income ?? null)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className={'text-sm text-muted-foreground'}>
              Operating margin
            </CardTitle>
          </CardHeader>
          <CardContent className={'text-xl font-semibold'}>
            {formatPercent(latest?.operating_margin ?? null)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className={'text-sm text-muted-foreground'}>Cash balance</CardTitle>
          </CardHeader>
          <CardContent className={'text-xl font-semibold'}>
            {formatMoney(latestRaw?.cash_balance ?? null)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className={'text-sm text-muted-foreground'}>Headcount</CardTitle>
          </CardHeader>
          <CardContent className={'text-xl font-semibold'}>
            {latestRaw?.headcount ?? NO_DATA}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Monthly trend</CardTitle>
        </CardHeader>
        <CardContent>
          {props.summary.periods.length === 0 ? (
            <p className={'text-sm text-muted-foreground'}>
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
                      className={'w-3 rounded-t bg-primary'}
                      style={{ height: `${revenueHeights[index] ?? 0}%` }}
                      title={`Revenue: ${formatMoney(period.revenue)}`}
                    />
                    <div
                      className={'w-3 rounded-t bg-muted-foreground'}
                      style={{ height: `${noiHeights[index] ?? 0}%` }}
                      title={`Net operating income: ${formatMoney(period.net_operating_income)}`}
                    />
                  </div>
                  <span className={'text-xs text-muted-foreground'}>
                    {formatMonthLabel(period.period_month)}
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
          <VarianceRow label={'Revenue'} variance={props.summary.variance.revenue} />
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
                  <SelectItem key={period.period_month} value={period.period_month}>
                    {formatMonthLabel(period.period_month)}
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

          <Button disabled={pending || periodMonth.trim() === ''} onClick={save}>
            Save month
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
