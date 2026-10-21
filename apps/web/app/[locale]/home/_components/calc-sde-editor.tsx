'use client';

import { useMemo, useState } from 'react';

import { recastPeriod, sdePeriodsSchema, weightedSde } from '@odb/calculators';
import { saveSdeCalc } from '@odb/deals/server';
import type { CalcSources } from '@odb/deals/shared';
import { Button } from '@odb/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@odb/ui/table';
import { cn } from '@odb/ui/utils';

import { CitedField } from './calc-input-sources';
import {
  type ScalarSdeLineCode,
  type SdePeriodDraft,
  CurrencyField,
  NumberField,
  SDE_LINE_GROUPS,
  SDE_LINE_LABELS,
  TextField,
  UnsavedChangesGuard,
  buildSdePeriod,
  emptySdePeriodDraft,
  money,
  num,
  pctText,
  sdeLinesFromDraft,
} from './calc-shared';
import { useRefusableAction } from './use-refusable-action';

const PINNED = 'bg-card sticky left-0 z-10';

function randomId(): string {
  return crypto.randomUUID();
}

export function CalcSdeEditor(props: {
  calcVersionId: string;
  initialPeriods: SdePeriodDraft[];
  sources: CalcSources;
}) {
  const { refusal, pending, run } = useRefusableAction();
  const [periods, setPeriods] = useState<SdePeriodDraft[]>(
    props.initialPeriods.length > 0
      ? props.initialPeriods
      : [emptySdePeriodDraft('1')],
  );
  const [pristine] = useState(periods);
  const [savedPeriods, setSavedPeriods] = useState<SdePeriodDraft[] | null>(
    null,
  );
  const savedRows = new Set(
    (savedPeriods ?? props.initialPeriods).flatMap((period) => [
      period.id,
      ...period.custom.map((line) => line.id),
    ]),
  );

  function update(index: number, change: Partial<SdePeriodDraft>) {
    setPeriods((current) =>
      current.map((period, i) =>
        i === index ? { ...period, ...change } : period,
      ),
    );
  }

  function setAmount(index: number, code: ScalarSdeLineCode, value: string) {
    setPeriods((current) =>
      current.map((period, i) =>
        i === index
          ? { ...period, amounts: { ...period.amounts, [code]: value } }
          : period,
      ),
    );
  }

  const built = useMemo(() => periods.map(buildSdePeriod), [periods]);
  const recasts = useMemo(() => built.map(recastPeriod), [built]);
  const weighted = useMemo(() => weightedSde(built), [built]);
  const validation = useMemo(() => sdePeriodsSchema.safeParse(built), [built]);
  const validationMessage = validation.success
    ? null
    : (validation.error.issues[0]?.message ?? 'Invalid SDE periods');

  function save() {
    const saving = periods;
    run(
      () =>
        saveSdeCalc({
          calc_version_id: props.calcVersionId,
          periods: periods.map((period) => ({
            id: period.id,
            label: period.label.trim() === '' ? undefined : period.label,
            weight: num(period.weight),
            months: period.months.trim() === '' ? null : num(period.months),
            lines: sdeLinesFromDraft(period),
          })),
        }),
      () => setSavedPeriods(saving),
    );
  }

  return (
    <div className={'flex flex-col gap-4'}>
      <UnsavedChangesGuard dirty={periods !== (savedPeriods ?? pristine)} />
      <div
        className={
          'max-h-[calc(100dvh-13rem)] overflow-auto [&>[data-slot=table-container]]:overflow-visible'
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className={cn(PINNED, 'top-0 z-30 min-w-48')}>
                Line
              </TableHead>
              {periods.map((period, index) => (
                <TableHead
                  key={period.id}
                  className={'bg-card sticky top-0 z-20 min-w-44'}
                >
                  <div className={'flex items-center justify-between gap-2'}>
                    <span>Period {index + 1}</span>
                    <Button
                      variant={'ghost'}
                      size={'sm'}
                      aria-label={`Remove period ${index + 1}`}
                      disabled={periods.length === 1}
                      onClick={() =>
                        setPeriods((current) =>
                          current.filter((_row, i) => i !== index),
                        )
                      }
                    >
                      Remove
                    </Button>
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className={PINNED}>Label</TableCell>
              {periods.map((period, index) => (
                <TableCell key={index}>
                  <TextField
                    value={period.label}
                    placeholder={'Period label'}
                    aria-label={`Label, period ${index + 1}`}
                    onChange={(value) => update(index, { label: value })}
                  />
                </TableCell>
              ))}
            </TableRow>
            <TableRow>
              <TableCell className={PINNED}>Weight</TableCell>
              {periods.map((period, index) => (
                <TableCell key={index}>
                  <CitedField
                    sources={props.sources}
                    input={{ rowId: period.id, field: 'weight' }}
                    unsaved={!savedRows.has(period.id)}
                    label={`Weight, period ${index + 1}`}
                  >
                    <NumberField
                      value={period.weight}
                      placeholder={'0.0'}
                      aria-label={`Weight, period ${index + 1}`}
                      onChange={(value) => update(index, { weight: value })}
                    />
                  </CitedField>
                </TableCell>
              ))}
            </TableRow>
            <TableRow>
              <TableCell className={PINNED}>
                Partial year months (1-11)
              </TableCell>
              {periods.map((period, index) => (
                <TableCell key={index}>
                  <CitedField
                    sources={props.sources}
                    input={{ rowId: period.id, field: 'months' }}
                    unsaved={!savedRows.has(period.id)}
                    label={`Partial year months, period ${index + 1}`}
                  >
                    <NumberField
                      value={period.months}
                      placeholder={'Full year'}
                      aria-label={`Partial year months, period ${index + 1}`}
                      onChange={(value) => update(index, { months: value })}
                    />
                  </CitedField>
                </TableCell>
              ))}
            </TableRow>

            {SDE_LINE_GROUPS.map((group) => (
              <GroupRows
                key={group.title}
                title={group.title}
                codes={group.codes}
                periods={periods}
                sources={props.sources}
                savedRows={savedRows}
                onAmount={setAmount}
              />
            ))}

            <TableRow>
              <TableCell className={cn(PINNED, 'font-medium')}>
                Net income
              </TableCell>
              {recasts.map((recast, index) => (
                <TableCell key={index}>{money(recast.net_income)}</TableCell>
              ))}
            </TableRow>
            <TableRow>
              <TableCell className={cn(PINNED, 'font-medium')}>
                Basic discretionary earnings
              </TableCell>
              {recasts.map((recast, index) => (
                <TableCell key={index}>
                  {money(recast.basic_discretionary_earnings)}
                </TableCell>
              ))}
            </TableRow>
            <TableRow>
              <TableCell className={cn(PINNED, 'font-medium')}>
                Total SDE
              </TableCell>
              {recasts.map((recast, index) => (
                <TableCell key={index}>{money(recast.total_sde)}</TableCell>
              ))}
            </TableRow>
            <TableRow>
              <TableCell className={cn(PINNED, 'font-medium')}>
                Margin
              </TableCell>
              {recasts.map((recast, index) => (
                <TableCell key={index}>{pctText(recast.margin)}</TableCell>
              ))}
            </TableRow>
            <TableRow>
              <TableCell className={cn(PINNED, 'font-medium')}>
                Annualized SDE
              </TableCell>
              {recasts.map((recast, index) => (
                <TableCell key={index}>
                  {money(recast.annualized_sde)}
                </TableCell>
              ))}
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <div className={'flex flex-col gap-4'}>
        {periods.map((period, index) => (
          <CustomLines
            key={index}
            label={`Period ${index + 1} custom addbacks`}
            period={period}
            sources={props.sources}
            savedRows={savedRows}
            onChange={(change) => update(index, change)}
            makeId={randomId}
          />
        ))}
      </div>

      <div
        className={
          'bg-card sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-4 border-t py-4'
        }
      >
        <div className={'text-sm'}>
          <span className={'text-muted-foreground'}>Weighted SDE</span>{' '}
          <span className={'text-lg font-semibold'}>{money(weighted)}</span>
          {validationMessage !== null && (
            <p className={'text-destructive mt-1 text-xs'}>
              {validationMessage}
            </p>
          )}
        </div>
        <div className={'flex flex-wrap items-center gap-2'}>
          <p role={'status'} className={'text-muted-foreground text-sm'}>
            {savedPeriods === periods ? 'Saved' : null}
          </p>
          {refusal ? (
            <p role={'alert'} className={'text-destructive text-sm'}>
              {refusal}
            </p>
          ) : null}
          <Button
            variant={'outline'}
            size={'sm'}
            onClick={() =>
              setPeriods((current) => [...current, emptySdePeriodDraft('0')])
            }
          >
            Add period
          </Button>
          <Button
            size={'sm'}
            disabled={pending || !validation.success}
            onClick={save}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

function GroupRows(props: {
  title: string;
  codes: ScalarSdeLineCode[];
  periods: SdePeriodDraft[];
  sources: CalcSources;
  savedRows: Set<string>;
  onAmount: (index: number, code: ScalarSdeLineCode, value: string) => void;
}) {
  return (
    <>
      <TableRow>
        <TableCell
          colSpan={props.periods.length + 1}
          className={cn(PINNED, 'bg-muted/50 text-xs font-semibold uppercase')}
        >
          {props.title}
        </TableCell>
      </TableRow>
      {props.codes.map((code) => (
        <TableRow key={code}>
          <TableCell className={PINNED}>{SDE_LINE_LABELS[code]}</TableCell>
          {props.periods.map((period, index) => (
            <TableCell key={index}>
              <CitedField
                sources={props.sources}
                input={{ rowId: period.id, field: code }}
                unsaved={!props.savedRows.has(period.id)}
                label={`${SDE_LINE_LABELS[code]}, period ${index + 1}`}
              >
                <CurrencyField
                  value={period.amounts[code] ?? ''}
                  placeholder={'0'}
                  aria-label={`${SDE_LINE_LABELS[code]}, period ${index + 1}`}
                  onChange={(value) => props.onAmount(index, code, value)}
                />
              </CitedField>
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

function CustomLines(props: {
  label: string;
  period: SdePeriodDraft;
  sources: CalcSources;
  savedRows: Set<string>;
  onChange: (change: Partial<SdePeriodDraft>) => void;
  makeId: () => string;
}) {
  const { custom } = props.period;
  return (
    <div className={'flex flex-col gap-2'}>
      <div className={'flex items-center justify-between'}>
        <span className={'text-xs font-semibold uppercase'}>{props.label}</span>
        <Button
          variant={'outline'}
          size={'sm'}
          onClick={() =>
            props.onChange({
              custom: [
                ...custom,
                { id: props.makeId(), label: '', amount: '' },
              ],
            })
          }
        >
          Add custom
        </Button>
      </div>
      {custom.map((row, rowIndex) => (
        <div key={row.id} className={'flex items-center gap-2'}>
          <TextField
            value={row.label}
            placeholder={'Label'}
            aria-label={`${props.label}, label ${rowIndex + 1}`}
            onChange={(value) =>
              props.onChange({
                custom: custom.map((item, i) =>
                  i === rowIndex ? { ...item, label: value } : item,
                ),
              })
            }
          />
          <CitedField
            sources={props.sources}
            input={{ rowId: row.id, field: 'amount' }}
            unsaved={!props.savedRows.has(row.id)}
            label={`${props.label}, amount ${rowIndex + 1}`}
          >
            <CurrencyField
              value={row.amount}
              placeholder={'0'}
              aria-label={`${props.label}, amount ${rowIndex + 1}`}
              onChange={(value) =>
                props.onChange({
                  custom: custom.map((item, i) =>
                    i === rowIndex ? { ...item, amount: value } : item,
                  ),
                })
              }
            />
          </CitedField>
          <Button
            variant={'ghost'}
            size={'sm'}
            onClick={() =>
              props.onChange({
                custom: custom.filter((_item, i) => i !== rowIndex),
              })
            }
          >
            Remove
          </Button>
        </div>
      ))}
    </div>
  );
}
