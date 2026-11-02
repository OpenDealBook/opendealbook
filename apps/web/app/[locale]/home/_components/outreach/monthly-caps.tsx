'use client';

import { useState } from 'react';

import { Button } from '@odb/ui/button';
import { Input } from '@odb/ui/input';
import { Label } from '@odb/ui/label';

import { useRefusableAction } from '../use-refusable-action';
import {
  retryResumeCappedRunsAction,
  saveMonthlyCapsAction,
} from './monthly-caps-actions';
import type { MonthlyCapsUsage } from './monthly-caps-usage';

export function MonthlyCaps({
  accountId,
  caps,
}: {
  accountId: string;
  caps: MonthlyCapsUsage;
}) {
  const { refusal, pending, run } = useRefusableAction();
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [letters, setLetters] = useState(String(caps.letters.cap));
  const [lookups, setLookups] = useState(String(caps.lookups.cap));
  const [ai, setAi] = useState(String(caps.ai.cap));

  function showResumeError(result: { resumeError: string | null }) {
    setResumeError(result.resumeError);
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    run(
      () =>
        saveMonthlyCapsAction({
          accountId,
          letterMonthlyCap: Number(letters),
          lookupMonthlyCap: Number(lookups),
          aiMonthlyCreditCap: Number(ai),
        }),
      showResumeError,
    );
  }

  return (
    <form onSubmit={onSubmit} className={'flex flex-col gap-4'}>
      <div className={'grid max-w-3xl gap-4 md:grid-cols-3'}>
        <CapField
          id={'letter-monthly-cap'}
          label={'Letters per month'}
          usage={`${caps.letters.used} used this month`}
          value={letters}
          onChange={setLetters}
        />
        <CapField
          id={'lookup-monthly-cap'}
          label={'Paid lookups per month'}
          usage={`${caps.lookups.used} used this month`}
          value={lookups}
          onChange={setLookups}
        />
        <CapField
          id={'ai-monthly-cap'}
          label={'AI credits per month'}
          usage={aiUsage(caps.ai)}
          value={ai}
          onChange={setAi}
        >
          1 credit is $0.01 of model spend on your own AI key. Calls to a model
          without a known price, or to an OpenAI-compatible endpoint without
          prices entered, are not counted. Each counted call holds the most it
          could cost until it finishes, so a call that might not fit in what is
          left waits for next month or a higher cap.
        </CapField>
      </div>

      {(refusal ?? resumeError) ? (
        <p role={'alert'} className={'text-destructive text-sm'}>
          {refusal ?? resumeError}
        </p>
      ) : null}

      <div className={'flex gap-2'}>
        <Button type={'submit'} disabled={pending}>
          {pending ? 'Saving...' : 'Save caps'}
        </Button>
        {resumeError ? (
          <Button
            type={'button'}
            variant={'outline'}
            disabled={pending}
            onClick={() =>
              run(
                () => retryResumeCappedRunsAction({ accountId }),
                showResumeError,
              )
            }
          >
            Try again
          </Button>
        ) : null}
      </div>
    </form>
  );
}

const wholeNumber = new Intl.NumberFormat('en-US');
const dollars = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});
const resetDay = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

function aiUsage({ cap, used, resetsAt }: MonthlyCapsUsage['ai']): string {
  const usedCredits = Math.ceil(used);
  return `Used ${wholeNumber.format(usedCredits)} of ${wholeNumber.format(cap)} credits (${dollars.format(usedCredits / 100)}), resets ${resetDay.format(new Date(resetsAt))}`;
}

function CapField({
  id,
  label,
  usage,
  value,
  onChange,
  children,
}: {
  id: string;
  label: string;
  usage: string;
  value: string;
  onChange: (value: string) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className={'flex flex-col gap-2'}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        aria-label={label}
        type={'number'}
        min={0}
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <p className={'text-muted-foreground text-sm'}>{usage}</p>
      {children ? (
        <p className={'text-muted-foreground text-xs'}>{children}</p>
      ) : null}
    </div>
  );
}
