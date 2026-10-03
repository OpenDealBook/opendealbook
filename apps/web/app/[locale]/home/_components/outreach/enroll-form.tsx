'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { enrollTargets } from '@odb/outreach-app/server';
import { Button } from '@odb/ui/button';
import { Checkbox } from '@odb/ui/checkbox';
import { Label } from '@odb/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@odb/ui/select';

export interface EnrollContact {
  id: string;
  name: string;
  email: string | null;
}

export interface EnrollFirm {
  id: string;
  name: string;
  contacts: EnrollContact[];
}

export interface EnrollSequenceOption {
  id: string;
  name: string;
}

function toggle(set: Set<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  return next;
}

export function EnrollForm({
  accountId,
  firms,
  sequences,
}: {
  accountId: string;
  firms: EnrollFirm[];
  sequences: EnrollSequenceOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    enrolled: number;
    skipped: number;
  } | null>(null);

  const [sequenceId, setSequenceId] = useState(sequences[0]?.id ?? '');
  const [firmIds, setFirmIds] = useState<Set<string>>(new Set());
  const [contactIds, setContactIds] = useState<Set<string>>(new Set());

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);

    startTransition(async () => {
      try {
        const outcome = await enrollTargets({
          accountId,
          sequenceId,
          firmIds: [...firmIds],
          contactIds: [...contactIds],
        });
        setResult({
          enrolled: outcome.enrolled.length,
          skipped: outcome.skipped.length,
        });
        setFirmIds(new Set());
        setContactIds(new Set());
        router.refresh();
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : 'Could not enroll targets',
        );
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className={'flex flex-col gap-4'}>
      <div className={'flex flex-col gap-2'}>
        <Label htmlFor={'enroll-sequence'}>Sequence</Label>
        <Select value={sequenceId} onValueChange={setSequenceId}>
          <SelectTrigger id={'enroll-sequence'} className={'w-80'}>
            <SelectValue placeholder={'Select a sequence'} />
          </SelectTrigger>
          <SelectContent>
            {sequences.map((sequence) => (
              <SelectItem key={sequence.id} value={sequence.id}>
                {sequence.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {firms.length === 0 ? (
        <p className={'text-muted-foreground text-sm'}>No firms yet.</p>
      ) : (
        <div className={'flex flex-col gap-4'}>
          {firms.map((firm) => (
            <div key={firm.id} className={'rounded border p-3'}>
              <label className={'flex items-center gap-2 text-sm font-medium'}>
                <Checkbox
                  checked={firmIds.has(firm.id)}
                  onCheckedChange={() =>
                    setFirmIds((current) => toggle(current, firm.id))
                  }
                />
                {firm.name}
              </label>
              <div className={'mt-2 flex flex-col gap-1 pl-6'}>
                {firm.contacts.map((contact) => (
                  <label
                    key={contact.id}
                    className={'flex items-center gap-2 text-sm'}
                  >
                    <Checkbox
                      checked={contactIds.has(contact.id)}
                      onCheckedChange={() =>
                        setContactIds((current) => toggle(current, contact.id))
                      }
                    />
                    {contact.name}
                    <span className={'text-muted-foreground'}>
                      {contact.email ?? 'no email'}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {error !== null ? (
        <p className={'text-destructive text-sm'}>{error}</p>
      ) : null}

      {result !== null ? (
        <p className={'text-sm'}>
          Enrolled {result.enrolled}, skipped {result.skipped} (no emailable
          contact).
        </p>
      ) : null}

      <div>
        <Button
          type={'submit'}
          disabled={pending || sequenceId === '' || firms.length === 0}
        >
          {pending ? 'Enrolling...' : 'Enroll selected'}
        </Button>
      </div>
    </form>
  );
}
