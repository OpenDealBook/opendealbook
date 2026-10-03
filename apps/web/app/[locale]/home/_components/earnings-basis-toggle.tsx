'use client';

import { useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { setEarningsBasis } from '@odb/deals/server';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@odb/ui/select';

const BASES: { value: 'sde' | 'ebitda'; label: string }[] = [
  { value: 'sde', label: 'SDE' },
  { value: 'ebitda', label: 'EBITDA' },
];

export function EarningsBasisToggle(props: {
  dealId: string;
  basis: 'sde' | 'ebitda';
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Select
      value={props.basis}
      onValueChange={(value) =>
        startTransition(async () => {
          await setEarningsBasis({
            deal_id: props.dealId,
            earnings_basis: value as 'sde' | 'ebitda',
          });
          router.refresh();
        })
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
  );
}
