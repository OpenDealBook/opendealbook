'use client';

import { useMemo, useState } from 'react';

import { workingCapital } from '@odb/calculators';
import { saveWorkingCapitalCalc } from '@odb/deals/server';
import type { CalcSources } from '@odb/deals/shared';
import { Button } from '@odb/ui/button';

import { CitedField } from './calc-input-sources';
import {
  type WorkingCapitalDraft,
  MoneyInput,
  UnsavedChangesGuard,
  money,
  num,
} from './calc-shared';
import { useRefusableAction } from './use-refusable-action';

export function CalcWorkingCapitalEditor(props: {
  calcVersionId: string;
  initial: WorkingCapitalDraft;
  sources: CalcSources;
}) {
  const { refusal, pending, run } = useRefusableAction();
  const [draft, setDraft] = useState<WorkingCapitalDraft>(props.initial);
  const [pristine] = useState(draft);
  const [savedDraft, setSavedDraft] = useState<WorkingCapitalDraft | null>(
    null,
  );

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
    const saving = draft;
    run(
      () =>
        saveWorkingCapitalCalc({
          calc_version_id: props.calcVersionId,
          current_assets: num(draft.current_assets),
          current_liabilities: num(draft.current_liabilities),
          avg_monthly_revenue: num(draft.avg_monthly_revenue),
        }),
      () => setSavedDraft(saving),
    );
  }

  return (
    <div className={'flex flex-col gap-4'}>
      <UnsavedChangesGuard dirty={draft !== (savedDraft ?? pristine)} />
      <div className={'grid grid-cols-2 gap-4 sm:grid-cols-3'}>
        <CitedField
          sources={props.sources}
          input={{ rowId: null, field: 'current_assets' }}
          label={'Current assets'}
        >
          <MoneyInput
            label={'Current assets'}
            value={draft.current_assets}
            onChange={(v) => set({ current_assets: v })}
          />
        </CitedField>
        <CitedField
          sources={props.sources}
          input={{ rowId: null, field: 'current_liabilities' }}
          label={'Current liabilities'}
        >
          <MoneyInput
            label={'Current liabilities'}
            value={draft.current_liabilities}
            onChange={(v) => set({ current_liabilities: v })}
          />
        </CitedField>
        <CitedField
          sources={props.sources}
          input={{ rowId: null, field: 'avg_monthly_revenue' }}
          label={'Average monthly revenue'}
        >
          <MoneyInput
            label={'Average monthly revenue'}
            value={draft.avg_monthly_revenue}
            onChange={(v) => set({ avg_monthly_revenue: v })}
          />
        </CitedField>
      </div>

      <dl className={'grid grid-cols-2 gap-x-6 gap-y-2'}>
        <div className={'flex flex-col gap-0.5'}>
          <dt className={'text-muted-foreground text-xs uppercase'}>
            Working capital
          </dt>
          <dd className={'text-sm font-medium'}>
            {money(result.working_capital)}
          </dd>
        </div>
        <div className={'flex flex-col gap-0.5'}>
          <dt className={'text-muted-foreground text-xs uppercase'}>
            Months of revenue covered
          </dt>
          <dd className={'text-sm font-medium'}>
            {result.months_of_revenue_covered == null
              ? 'n/a'
              : result.months_of_revenue_covered.toFixed(1)}
          </dd>
        </div>
      </dl>

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
        <Button size={'sm'} disabled={pending} onClick={save}>
          Save
        </Button>
      </div>
    </div>
  );
}
