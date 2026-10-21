'use client';

import { setEarningsBasis } from '@odb/deals/server';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@odb/ui/select';

import { useRefusableAction } from './use-refusable-action';

const BASES: { value: 'sde' | 'ebitda'; label: string }[] = [
  { value: 'sde', label: 'SDE' },
  { value: 'ebitda', label: 'EBITDA' },
];

export function EarningsBasisToggle(props: {
  dealId: string;
  basis: 'sde' | 'ebitda';
}) {
  const { refusal, pending, run } = useRefusableAction();

  return (
    <div className={'flex flex-col gap-1'}>
      <Select
        value={props.basis}
        onValueChange={(value) =>
          run(() =>
            setEarningsBasis({
              deal_id: props.dealId,
              earnings_basis: value as 'sde' | 'ebitda',
            }),
          )
        }
      >
        <SelectTrigger className={'w-40'} disabled={pending}>
          <SelectValue placeholder={'Earnings basis'} />
        </SelectTrigger>
        <SelectContent>
          {BASES.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {refusal ? (
        <p role={'alert'} className={'text-destructive text-sm'}>
          {refusal}
        </p>
      ) : null}
    </div>
  );
}
