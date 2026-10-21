'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import {
  addLender,
  editLender,
} from '@odb/lender-rooms/crm/lenders/actions.ts';
import { ProblemNote } from '@odb/lender-rooms/requests-ui/refusal-note.tsx';
import { useAttempt } from '@odb/lender-rooms/requests-ui/use-attempt.ts';
import { Button } from '@odb/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@odb/ui/dialog';
import { Input } from '@odb/ui/input';
import { Label } from '@odb/ui/label';
import { Textarea } from '@odb/ui/textarea';

import { teamSignInPath } from '../lender-wording';
import { RATE_TYPE_WORDING, type SavedLender } from './saved-lender';

type RateType = keyof typeof RATE_TYPE_WORDING;

function listOf(text: string) {
  return text
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function numberOrNull(text: string) {
  return text.trim() === '' ? null : Number(text);
}

function LenderFields({
  accountId,
  lender,
  onSaved,
}: {
  accountId: string;
  lender: SavedLender | undefined;
  onSaved: () => void;
}) {
  const saving = useAttempt();
  const [name, setName] = useState(lender?.name ?? '');
  const [website, setWebsite] = useState(lender?.website ?? '');
  const [rateType, setRateType] = useState<RateType | null>(
    lender?.rate_type ?? null,
  );
  const [typicalRate, setTypicalRate] = useState(
    lender?.typical_rate?.toString() ?? '',
  );
  const [maxLoan, setMaxLoan] = useState(lender?.max_loan?.toString() ?? '');
  const [sbaPreferred, setSbaPreferred] = useState(
    lender?.sba_preferred ?? false,
  );
  const [industries, setIndustries] = useState(
    lender?.industries.join(', ') ?? '',
  );
  const [states, setStates] = useState(lender?.states.join(', ') ?? '');
  const [tags, setTags] = useState(lender?.tags.join(', ') ?? '');
  const [notes, setNotes] = useState(lender?.notes ?? '');

  function save() {
    const profile = {
      name,
      website,
      rateType,
      typicalRate: numberOrNull(typicalRate),
      maxLoan: numberOrNull(maxLoan),
      sbaPreferred,
      industries: listOf(industries),
      states: listOf(states),
      tags: listOf(tags),
      notes: notes.trim() === '' ? null : notes,
    };

    saving.attempt(
      () =>
        lender
          ? editLender({ lenderId: lender.id, ...profile })
          : addLender({ accountId, ...profile }),
      onSaved,
    );
  }

  return (
    <form
      className={'flex flex-col gap-4'}
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <div className={'grid gap-4 sm:grid-cols-2'}>
        <div className={'flex flex-col gap-2'}>
          <Label htmlFor={'lender-crm-name'}>Lender name</Label>
          <Input
            id={'lender-crm-name'}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className={'flex flex-col gap-2'}>
          <Label htmlFor={'lender-crm-website'}>Website</Label>
          <Input
            id={'lender-crm-website'}
            value={website}
            placeholder={'firstbank.com'}
            onChange={(event) => setWebsite(event.target.value)}
          />
        </div>
      </div>
      <fieldset className={'flex flex-col gap-2'}>
        <legend className={'mb-2 text-sm font-medium'}>Rate type</legend>
        <div className={'flex flex-wrap gap-4 text-sm'}>
          {([null, 'fixed', 'variable', 'either'] as const).map((value) => (
            <label key={value ?? 'none'} className={'flex items-center gap-2'}>
              <input
                type={'radio'}
                name={'lender-crm-rate-type'}
                className={'accent-primary size-4'}
                checked={rateType === value}
                onChange={() => setRateType(value)}
              />
              {value === null ? 'Not set' : RATE_TYPE_WORDING[value]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className={'grid gap-4 sm:grid-cols-2'}>
        <div className={'flex flex-col gap-2'}>
          <Label htmlFor={'lender-crm-rate'}>Typical rate (%)</Label>
          <Input
            id={'lender-crm-rate'}
            type={'number'}
            step={'any'}
            value={typicalRate}
            onChange={(event) => setTypicalRate(event.target.value)}
          />
        </div>
        <div className={'flex flex-col gap-2'}>
          <Label htmlFor={'lender-crm-max-loan'}>Largest loan ($)</Label>
          <Input
            id={'lender-crm-max-loan'}
            type={'number'}
            step={'any'}
            value={maxLoan}
            onChange={(event) => setMaxLoan(event.target.value)}
          />
        </div>
      </div>
      <label className={'flex items-center gap-2 text-sm'}>
        <input
          type={'checkbox'}
          className={'accent-primary size-4'}
          checked={sbaPreferred}
          onChange={(event) => setSbaPreferred(event.target.checked)}
        />
        Prefers SBA loans
      </label>
      <div className={'grid gap-4 sm:grid-cols-2'}>
        <div className={'flex flex-col gap-2'}>
          <Label htmlFor={'lender-crm-industries'}>Industries</Label>
          <Input
            id={'lender-crm-industries'}
            value={industries}
            placeholder={'Manufacturing, Healthcare'}
            onChange={(event) => setIndustries(event.target.value)}
          />
        </div>
        <div className={'flex flex-col gap-2'}>
          <Label htmlFor={'lender-crm-states'}>States</Label>
          <Input
            id={'lender-crm-states'}
            value={states}
            placeholder={'TX, OK'}
            onChange={(event) => setStates(event.target.value)}
          />
        </div>
      </div>
      <div className={'flex flex-col gap-2'}>
        <Label htmlFor={'lender-crm-tags'}>Tags</Label>
        <Input
          id={'lender-crm-tags'}
          value={tags}
          placeholder={'Separate tags with commas'}
          onChange={(event) => setTags(event.target.value)}
        />
      </div>
      <div className={'flex flex-col gap-2'}>
        <Label htmlFor={'lender-crm-notes'}>Notes</Label>
        <Textarea
          id={'lender-crm-notes'}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>
      <ProblemNote problem={saving.problem} signInPath={teamSignInPath} />
      <DialogFooter>
        <Button type={'submit'} disabled={saving.isPending}>
          Save lender
        </Button>
      </DialogFooter>
    </form>
  );
}

export function LenderFormDialog({
  accountId,
  lender,
}: {
  accountId: string;
  lender?: SavedLender;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        variant={lender ? 'outline' : 'default'}
        size={lender ? 'sm' : 'default'}
        aria-label={lender ? `Edit ${lender.name}` : undefined}
        onClick={() => setIsOpen(true)}
      >
        {lender ? 'Edit' : 'Add lender'}
      </Button>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className={'sm:max-w-2xl'}>
          <DialogHeader>
            <DialogTitle>
              {lender ? `Edit ${lender.name}` : 'Add a lender'}
            </DialogTitle>
          </DialogHeader>
          <LenderFields
            accountId={accountId}
            lender={lender}
            onSaved={() => {
              setIsOpen(false);
              router.refresh();
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
