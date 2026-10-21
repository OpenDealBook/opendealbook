'use client';

import { useState } from 'react';

import type { DealBoxCriteria } from '@odb/deals/schema';
import { upsertDealBox } from '@odb/deals/server';
import { Button } from '@odb/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@odb/ui/card';
import { Input } from '@odb/ui/input';
import { Label } from '@odb/ui/label';

import { GatedControl } from './gated-control';
import { useRefusableAction } from './use-refusable-action';

const DSCR_REFERENCES: { label: string; value: string }[] = [
  { label: 'SBA minimum', value: '1.25x' },
  { label: 'SBA recommended', value: '1.50x' },
  { label: 'Firm preference', value: '2.25x' },
];

function toNumber(value: string): number | undefined {
  const trimmed = value.trim();
  return trimmed === '' ? undefined : Number(trimmed);
}

export function UnderwritingForm(props: {
  accountId: string;
  criteria: DealBoxCriteria;
  brokerSummary: string | null;
  minDscr: number | null;
  requiredPersonalCashFlow: number | null;
  canManage: boolean;
}) {
  const { refusal, pending, run } = useRefusableAction();
  const [minDscr, setMinDscr] = useState(props.minDscr?.toString() ?? '');
  const [requiredPersonalCashFlow, setRequiredPersonalCashFlow] = useState(
    props.requiredPersonalCashFlow?.toString() ?? '',
  );

  function save() {
    run(() =>
      upsertDealBox({
        account_id: props.accountId,
        criteria_json: props.criteria,
        broker_summary: props.brokerSummary ?? undefined,
        min_dscr: toNumber(minDscr),
        required_personal_cash_flow: toNumber(requiredPersonalCashFlow),
      }),
    );
  }

  return (
    <div className={'flex max-w-2xl flex-col gap-6'}>
      <Card>
        <CardHeader>
          <CardTitle>Deal box thresholds</CardTitle>
          <CardDescription>
            Set the debt service coverage ratio and personal cash flow a deal
            must clear to fit your deal box.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GatedControl
            allowed={props.canManage}
            reason={'Only deal managers can change the deal box.'}
          >
            <div className={'flex flex-col gap-4'}>
              <div className={'flex flex-col gap-2'}>
                <Label htmlFor={'min-dscr'}>Required DSCR</Label>
                <Input
                  id={'min-dscr'}
                  type={'number'}
                  step={'0.01'}
                  min={'0'}
                  value={minDscr}
                  onChange={(event) => setMinDscr(event.target.value)}
                  placeholder={'2.25'}
                />
                <div
                  className={
                    'text-muted-foreground flex flex-wrap gap-2 text-xs'
                  }
                >
                  {DSCR_REFERENCES.map((reference) => (
                    <span
                      key={reference.label}
                      className={'rounded-md border px-2 py-1'}
                    >
                      {reference.label}: {reference.value}
                    </span>
                  ))}
                </div>
                <p className={'text-muted-foreground text-xs'}>
                  Reference marks only. The SBA now requires a 1.25x minimum
                  DSCR and recommends 1.5x for underwriting; this firm prefers
                  2.25x for its investments.
                </p>
              </div>

              <div className={'flex flex-col gap-2'}>
                <Label htmlFor={'required-personal-cash-flow'}>
                  Required personal cash flow
                </Label>
                <Input
                  id={'required-personal-cash-flow'}
                  type={'number'}
                  step={'1000'}
                  min={'0'}
                  value={requiredPersonalCashFlow}
                  onChange={(event) =>
                    setRequiredPersonalCashFlow(event.target.value)
                  }
                  placeholder={'180000'}
                />
              </div>

              <div className={'flex flex-col gap-2'}>
                <Button
                  disabled={pending}
                  onClick={save}
                  className={'self-start'}
                >
                  {pending ? 'Saving' : 'Save'}
                </Button>
                {refusal ? (
                  <p role={'alert'} className={'text-destructive text-sm'}>
                    {refusal}
                  </p>
                ) : null}
              </div>
            </div>
          </GatedControl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How this is used</CardTitle>
        </CardHeader>
        <CardContent>
          <p className={'text-muted-foreground text-sm'}>
            Deals are screened against the required DSCR. A deal
            calculator&apos;s DSCR output is compared to this threshold to
            decide whether the deal clears underwriting.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
