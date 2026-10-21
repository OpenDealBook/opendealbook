'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import {
  type ContractDate,
  applyContractDates,
} from '@odb/deal-timeline/apply-contract-dates.ts';
import { plainDate } from '@odb/shared/utils';
import { Button } from '@odb/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@odb/ui/dialog';

export function ApplyContractDatesButton({
  contractId,
  dates,
}: {
  contractId: string;
  dates: ContractDate[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [isApplying, startApplying] = useTransition();

  function onApply() {
    startApplying(async () => {
      const result = await applyContractDates({
        contractId,
        previewed: dates.flatMap((date) =>
          'to' in date ? [{ kind: date.kind, from: date.from }] : [],
        ),
      });

      setRefusal(result.ok ? null : result.refusal);
      setOpen(!result.ok);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        type={'button'}
        variant={'outline'}
        size={'sm'}
        className={'self-start'}
        onClick={() => setOpen(true)}
      >
        Apply contract dates
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply contract dates</DialogTitle>
          </DialogHeader>
          <ul className={'flex flex-col gap-1 text-sm'}>
            {dates.map((date) => (
              <li key={date.kind}>
                <span className={'font-medium'}>{date.label}</span>{' '}
                {'to' in date ? (
                  `${date.from === null ? 'Not set' : plainDate(date.from)} → ${plainDate(date.to)}`
                ) : (
                  <span className={'text-muted-foreground'}>
                    {date.skipped}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {refusal ? (
            <p role={'alert'} className={'text-destructive text-sm'}>
              {refusal}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type={'button'}
              variant={'outline'}
              onClick={() => setOpen(false)}
              disabled={isApplying}
            >
              Cancel
            </Button>
            <Button type={'button'} onClick={onApply} disabled={isApplying}>
              Apply dates
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
