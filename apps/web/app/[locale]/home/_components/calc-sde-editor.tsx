'use client';

import { useMemo, useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import {
  recastPeriod,
  sdePeriodsSchema,
  weightedSde,
} from '@odb/calculators';
import { saveSdeCalc } from '@odb/deals/server';
import { Button } from '@odb/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@odb/ui/table';

import {
  type ScalarSdeLineCode,
  type SdePeriodDraft,
  NumberField,
  SDE_LINE_GROUPS,
  SDE_LINE_LABELS,
  TextField,
  buildSdePeriod,
  emptySdePeriodDraft,
  money,
  num,
  pctText,
  sdeLinesFromDraft,
} from './calc-shared';

function randomId(): string {
  return crypto.randomUUID();
}

export function CalcSdeEditor(props: {
  calcVersionId: string;
  initialPeriods: SdePeriodDraft[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [periods, setPeriods] = useState<SdePeriodDraft[]>(
    props.initialPeriods.length > 0
      ? props.initialPeriods
      : [emptySdePeriodDraft('1')],
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
    : validation.error.issues[0]?.message ?? 'Invalid SDE periods';

  function save() {
    startTransition(async () => {
      await saveSdeCalc({
        calc_version_id: props.calcVersionId,
        periods: periods.map((period) => ({
          label: period.label.trim() === '' ? undefined : period.label,
          weight: num(period.weight),
          months: period.months.trim() === '' ? null : num(period.months),
          lines: sdeLinesFromDraft(period),
        })),
      });
      router.refresh();
      props.onClose();
    });
  }

  return (
    <div className={'flex flex-col gap-4'}>
      <div className={'overflow-x-auto'}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className={'min-w-48'}>Line</TableHead>
              {periods.map((_, index) => (
                <TableHead key={index} className={'min-w-32'}>
                  <div className={'flex items-center justify-between gap-2'}>
                    <span>Period {index + 1}</span>
                    <Button
                      variant={'ghost'}
                      size={'sm'}
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
              <TableCell>Label</TableCell>
              {periods.map((period, index) => (
                <TableCell key={index}>
                  <TextField
                    value={period.label}
                    placeholder={'Period label'}
                    onChange={(value) => update(index, { label: value })}
                  />
                </TableCell>
              ))}
            </TableRow>
            <TableRow>
              <TableCell>Weight</TableCell>
              {periods.map((period, index) => (
                <TableCell key={index}>
                  <NumberField
                    value={period.weight}
                    placeholder={'0.0'}
                    onChange={(value) => update(index, { weight: value })}
                  />
                </TableCell>
              ))}
            </TableRow>
            <TableRow>
              <TableCell>Partial year months (1-11)</TableCell>
              {periods.map((period, index) => (
                <TableCell key={index}>
                  <NumberField
                    value={period.months}
                    placeholder={'Full year'}
                    onChange={(value) => update(index, { months: value })}
                  />
                </TableCell>
              ))}
            </TableRow>

            {SDE_LINE_GROUPS.map((group) => (
              <GroupRows
                key={group.title}
                title={group.title}
                codes={group.codes}
                periods={periods}
                onAmount={setAmount}
              />
            ))}

            <TableRow>
              <TableCell className={'font-medium'}>Net income</TableCell>
              {recasts.map((recast, index) => (
                <TableCell key={index}>{money(recast.net_income)}</TableCell>
              ))}
            </TableRow>
            <TableRow>
              <TableCell className={'font-medium'}>
                Basic discretionary earnings
              </TableCell>
              {recasts.map((recast, index) => (
                <TableCell key={index}>
                  {money(recast.basic_discretionary_earnings)}
                </TableCell>
              ))}
            </TableRow>
            <TableRow>
              <TableCell className={'font-medium'}>Total SDE</TableCell>
              {recasts.map((recast, index) => (
                <TableCell key={index}>{money(recast.total_sde)}</TableCell>
              ))}
            </TableRow>
            <TableRow>
              <TableCell className={'font-medium'}>Margin</TableCell>
              {recasts.map((recast, index) => (
                <TableCell key={index}>{pctText(recast.margin)}</TableCell>
              ))}
            </TableRow>
            <TableRow>
              <TableCell className={'font-medium'}>Annualized SDE</TableCell>
              {recasts.map((recast, index) => (
                <TableCell key={index}>{money(recast.annualized_sde)}</TableCell>
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
            onChange={(change) => update(index, change)}
            makeId={randomId}
          />
        ))}
      </div>

      <div className={'flex items-center justify-between gap-4 border-t pt-4'}>
        <div className={'text-sm'}>
          <span className={'text-muted-foreground'}>Weighted SDE</span>{' '}
          <span className={'text-lg font-semibold'}>{money(weighted)}</span>
          {validationMessage !== null && (
            <p className={'text-destructive mt-1 text-xs'}>{validationMessage}</p>
          )}
        </div>
        <div className={'flex gap-2'}>
          <Button
            variant={'outline'}
            size={'sm'}
            onClick={() =>
              setPeriods((current) => [...current, emptySdePeriodDraft('0')])
            }
          >
            Add period
          </Button>
          <Button variant={'outline'} size={'sm'} onClick={props.onClose}>
            Cancel
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
  onAmount: (index: number, code: ScalarSdeLineCode, value: string) => void;
}) {
  return (
    <>
      <TableRow>
        <TableCell
          colSpan={props.periods.length + 1}
          className={'bg-muted/50 text-xs font-semibold uppercase'}
        >
          {props.title}
        </TableCell>
      </TableRow>
      {props.codes.map((code) => (
        <TableRow key={code}>
          <TableCell>{SDE_LINE_LABELS[code]}</TableCell>
          {props.periods.map((period, index) => (
            <TableCell key={index}>
              <NumberField
                value={period.amounts[code] ?? ''}
                placeholder={'0'}
                onChange={(value) => props.onAmount(index, code, value)}
              />
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
            onChange={(value) =>
              props.onChange({
                custom: custom.map((item, i) =>
                  i === rowIndex ? { ...item, label: value } : item,
                ),
              })
            }
          />
          <NumberField
            value={row.amount}
            placeholder={'0'}
            onChange={(value) =>
              props.onChange({
                custom: custom.map((item, i) =>
                  i === rowIndex ? { ...item, amount: value } : item,
                ),
              })
            }
          />
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
