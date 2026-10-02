'use client';

import { useMemo, useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { workingCapital } from '@odb/calculators';
import { saveWorkingCapitalCalc } from '@odb/deals/server';
import { Button } from '@odb/ui/button';
import { Label } from '@odb/ui/label';

import {
  type WorkingCapitalDraft,
  NumberField,
  money,
  num,
} from './calc-shared';

export function CalcWorkingCapitalEditor(props: {
  calcVersionId: string;
  initial: WorkingCapitalDraft;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<WorkingCapitalDraft>(props.initial);

  const result = useMemo(
    () =>
      workingCapital({
        current_assets: num(draft.current_assets),
        current_liabilities: num(draft.current_liabilities),
        avg_monthly_revenue: num(draft.avg_monthly_revenue),
      }),
    [draft],
  );

  function set(change: Partial<WorkingCapitalDraft>) {
    setDraft((current) => ({ ...current, ...change }));
  }

  function save() {
    startTransition(async () => {
      await saveWorkingCapitalCalc({
        calc_version_id: props.calcVersionId,
        current_assets: num(draft.current_assets),
        current_liabilities: num(draft.current_liabilities),
        avg_monthly_revenue: num(draft.avg_monthly_revenue),
      });
      router.refresh();
      props.onClose();
    });
  }

  return (
    <div className={'flex flex-col gap-4'}>
      <div className={'grid grid-cols-2 gap-4 sm:grid-cols-3'}>
        <div className={'flex flex-col gap-1'}>
          <Label>Current assets</Label>
          <NumberField value={draft.current_assets} placeholder={'0'} onChange={(v) => set({ current_assets: v })} />
        </div>
        <div className={'flex flex-col gap-1'}>
          <Label>Current liabilities</Label>
          <NumberField value={draft.current_liabilities} placeholder={'0'} onChange={(v) => set({ current_liabilities: v })} />
        </div>
        <div className={'flex flex-col gap-1'}>
          <Label>Average monthly revenue</Label>
          <NumberField value={draft.avg_monthly_revenue} placeholder={'0'} onChange={(v) => set({ avg_monthly_revenue: v })} />
        </div>
      </div>

      <dl className={'grid grid-cols-2 gap-x-6 gap-y-2'}>
        <div className={'flex flex-col gap-0.5'}>
          <dt className={'text-muted-foreground text-xs uppercase'}>Working capital</dt>
          <dd className={'text-sm font-medium'}>{money(result.working_capital)}</dd>
        </div>
        <div className={'flex flex-col gap-0.5'}>
          <dt className={'text-muted-foreground text-xs uppercase'}>Months of revenue covered</dt>
          <dd className={'text-sm font-medium'}>
            {result.months_of_revenue_covered == null
              ? 'n/a'
              : result.months_of_revenue_covered.toFixed(1)}
          </dd>
        </div>
      </dl>

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
