'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import type { FundingSourceType } from '@odb/calculators';
import type { ProposedTerms } from '@odb/deals/server';
import { longDate } from '@odb/lender-outreach/draft-email.ts';
import type { ActionResult } from '@odb/lender-rooms/actions/refusal.ts';
import { ProblemNote } from '@odb/lender-rooms/requests-ui/refusal-note.tsx';
import { useAttempt } from '@odb/lender-rooms/requests-ui/use-attempt.ts';
import { itemAnchor } from '@odb/notifications/relay';
import { Button } from '@odb/ui/button';
import { Input } from '@odb/ui/input';
import { Label } from '@odb/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@odb/ui/select';
import { Textarea } from '@odb/ui/textarea';

import { FUNDING_TYPE_LABELS, FUNDING_TYPE_OPTIONS } from '../calc-shared';
import { teamSignInPath } from '../lender-wording';
import { RATE_TYPE_WORDING } from './saved-lender';

type Save<Input> = (input: Input) => Promise<ActionResult<unknown>>;

export interface CloseDeadlineInput {
  deal_id: string;
  must_close_by: string | null;
  must_close_reason: string | null;
}

export type TermsSoughtInput = ProposedTerms & {
  deal_id: string;
  notes: string | null;
};

function numberOrNull(text: string) {
  return text.trim() === '' ? null : Number(text.replaceAll(',', ''));
}

function grouped(text: string) {
  const [whole = '', fraction] = text.replace(/[^\d.]/g, '').split('.');
  const wholeGrouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction === undefined ? wholeGrouped : `${wholeGrouped}.${fraction}`;
}

export function CloseDeadlineForm({
  dealId,
  targetClose,
  deadline,
  save,
}: {
  dealId: string;
  targetClose: string | null;
  deadline: {
    must_close_by: string | null;
    must_close_reason: string | null;
  } | null;
  save: Save<CloseDeadlineInput>;
}) {
  const router = useRouter();
  const saving = useAttempt();
  const [mustCloseBy, setMustCloseBy] = useState(deadline?.must_close_by ?? '');
  const [reason, setReason] = useState(deadline?.must_close_reason ?? '');

  function submit() {
    const date = mustCloseBy.trim() || null;
    const why = reason.trim() || null;

    saving.attempt(
      async () =>
        why !== null && date === null
          ? {
              ok: false,
              refusal: 'Add the must close by date this reason explains.',
            }
          : save({
              deal_id: dealId,
              must_close_by: date,
              must_close_reason: why,
            }),
      () => router.refresh(),
    );
  }

  return (
    <form
      id={itemAnchor({ kind: 'must-close-by', id: dealId })}
      className={'flex flex-col gap-4'}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {targetClose || !deadline?.must_close_by ? (
        <p className={'text-sm'}>
          {targetClose
            ? `Target close ${longDate(targetClose)}`
            : 'No target close yet'}
          <span className={'text-muted-foreground'}>
            {' '}
            (set on the closing milestone)
          </span>
        </p>
      ) : null}
      <div className={'grid gap-4 sm:grid-cols-[12rem_1fr]'}>
        <div className={'flex flex-col gap-2'}>
          <Label htmlFor={'deal-must-close-by'}>Must close by</Label>
          <Input
            id={'deal-must-close-by'}
            type={'date'}
            value={mustCloseBy}
            onChange={(event) => setMustCloseBy(event.target.value)}
          />
        </div>
        <div className={'flex flex-col gap-2'}>
          <Label htmlFor={'deal-must-close-reason'}>Why that date</Label>
          <Input
            id={'deal-must-close-reason'}
            value={reason}
            placeholder={'The seller retires at the end of March'}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
      </div>
      <ProblemNote problem={saving.problem} signInPath={teamSignInPath} />
      <Button type={'submit'} className={'w-fit'} disabled={saving.isPending}>
        Save deadline
      </Button>
    </form>
  );
}

export function TermsSoughtForm({
  dealId,
  loaded,
  save,
}: {
  dealId: string;
  loaded: {
    source: 'saved' | 'proposed';
    terms: ProposedTerms & { notes?: string | null };
  };
  save: Save<TermsSoughtInput>;
}) {
  const router = useRouter();
  const saving = useAttempt();
  const { terms } = loaded;
  const [loanAmount, setLoanAmount] = useState(
    grouped(terms.loan_amount?.toString() ?? ''),
  );
  const [loanType, setLoanType] = useState<FundingSourceType | null>(
    terms.loan_type,
  );
  const [termYears, setTermYears] = useState(
    terms.term_years?.toString() ?? '',
  );
  const [rateType, setRateType] = useState(terms.rate_type);
  const [sellerNote, setSellerNote] = useState(
    grouped(terms.seller_note_amount?.toString() ?? ''),
  );
  const [notes, setNotes] = useState(terms.notes ?? '');

  return (
    <form
      className={'flex flex-col gap-4'}
      onSubmit={(event) => {
        event.preventDefault();
        saving.attempt(
          () =>
            save({
              deal_id: dealId,
              loan_amount: numberOrNull(loanAmount),
              loan_type: loanType,
              term_years: numberOrNull(termYears),
              rate_type: rateType,
              seller_note_amount: numberOrNull(sellerNote),
              notes: notes.trim() || null,
            }),
          () => router.refresh(),
        );
      }}
    >
      {loaded.source === 'proposed' ? (
        <p className={'text-muted-foreground text-sm'}>
          Proposed from the deal calc. Change anything, then save.
        </p>
      ) : null}
      <div className={'grid gap-4 sm:grid-cols-2'}>
        <div className={'flex flex-col gap-2'}>
          <Label htmlFor={'terms-loan-amount'}>Loan amount ($)</Label>
          <Input
            id={'terms-loan-amount'}
            inputMode={'decimal'}
            value={loanAmount}
            onChange={(event) => setLoanAmount(grouped(event.target.value))}
          />
        </div>
        <div className={'flex flex-col gap-2'}>
          <Label>Loan type</Label>
          <Select
            value={loanType ?? ''}
            onValueChange={(value) => setLoanType(value as FundingSourceType)}
          >
            <SelectTrigger className={'w-full'}>
              <SelectValue placeholder={'Not set'}>
                {loanType ? FUNDING_TYPE_LABELS[loanType] : null}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {FUNDING_TYPE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className={'flex flex-col gap-2'}>
          <Label htmlFor={'terms-years'}>Term (years)</Label>
          <Input
            id={'terms-years'}
            type={'number'}
            step={'any'}
            value={termYears}
            onChange={(event) => setTermYears(event.target.value)}
          />
        </div>
        <div className={'flex flex-col gap-2'}>
          <Label htmlFor={'terms-seller-note'}>Seller note ($)</Label>
          <Input
            id={'terms-seller-note'}
            inputMode={'decimal'}
            value={sellerNote}
            onChange={(event) => setSellerNote(grouped(event.target.value))}
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
                name={'terms-rate-type'}
                className={'accent-primary size-4'}
                checked={rateType === value}
                onChange={() => setRateType(value)}
              />
              {value === null ? 'Not set' : RATE_TYPE_WORDING[value]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className={'flex flex-col gap-2'}>
        <Label htmlFor={'terms-notes'}>Notes for lenders</Label>
        <Textarea
          id={'terms-notes'}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>
      <ProblemNote problem={saving.problem} signInPath={teamSignInPath} />
      <Button type={'submit'} className={'w-fit'} disabled={saving.isPending}>
        Save terms
      </Button>
    </form>
  );
}
