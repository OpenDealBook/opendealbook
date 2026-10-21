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
import type { MonthlyCap, MonthlyCapsUsage } from './monthly-caps-usage';

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
          aiMonthlyCap: Number(ai),
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
          usage={caps.letters}
          value={letters}
          onChange={setLetters}
        />
        <CapField
          id={'lookup-monthly-cap'}
          label={'Paid lookups per month'}
          usage={caps.lookups}
          value={lookups}
          onChange={setLookups}
        />
        <CapField
          id={'ai-monthly-cap'}
          label={'AI calls per month'}
          usage={caps.ai}
          value={ai}
          onChange={setAi}
        />
      </div>

      {refusal ?? resumeError ? (
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

function CapField({
  id,
  label,
  usage,
  value,
  onChange,
}: {
  id: string;
  label: string;
  usage: MonthlyCap;
  value: string;
  onChange: (value: string) => void;
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
      <p className={'text-muted-foreground text-sm'}>
        {usage.used} used this month
      </p>
    </div>
  );
}
