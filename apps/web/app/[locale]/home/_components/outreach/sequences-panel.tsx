'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import {
  createSequence,
  seedDefaultSequences,
  updateSequence,
} from '@odb/outreach-app/server';
import { Button } from '@odb/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@odb/ui/card';
import { Input } from '@odb/ui/input';
import { Label } from '@odb/ui/label';
import { Textarea } from '@odb/ui/textarea';

export interface SequenceStep {
  ordinal: number;
  delayDays: number;
  subject: string;
  body: string;
}

export interface Sequence {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  isDefault: boolean;
  steps: SequenceStep[];
}

type Draft = {
  sequenceId: string | null;
  name: string;
  description: string;
  subject: string;
  body: string;
};

const EMPTY_DRAFT: Draft = {
  sequenceId: null,
  name: '',
  description: '',
  subject: '',
  body: '',
};

function draftFromSequence(sequence: Sequence): Draft {
  const step = sequence.steps[0];
  return {
    sequenceId: sequence.id,
    name: sequence.name,
    description: sequence.description ?? '',
    subject: step?.subject ?? '',
    body: step?.body ?? '',
  };
}

export function SequencesPanel({
  accountId,
  sequences,
}: {
  accountId: string;
  sequences: Sequence[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  function run(work: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await work();
        setDraft(null);
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Something broke');
      }
    });
  }

  function onSeed() {
    run(() => seedDefaultSequences({ accountId }));
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft === null) {
      return;
    }

    const step: SequenceStep = {
      ordinal: 1,
      delayDays: 0,
      subject: draft.subject,
      body: draft.body,
    };

    run(() =>
      draft.sequenceId === null
        ? createSequence({
            accountId,
            name: draft.name,
            description: draft.description,
            steps: [step],
          })
        : updateSequence({
            accountId,
            sequenceId: draft.sequenceId,
            name: draft.name,
            description: draft.description,
            steps: [step],
          }),
    );
  }

  return (
    <div className={'flex flex-col gap-4'}>
      <div className={'flex items-center gap-3'}>
        <Button
          type={'button'}
          size={'sm'}
          onClick={() => setDraft({ ...EMPTY_DRAFT })}
        >
          New sequence
        </Button>
        {sequences.length === 0 ? (
          <Button
            type={'button'}
            size={'sm'}
            variant={'outline'}
            disabled={pending}
            onClick={onSeed}
          >
            {pending ? 'Seeding...' : 'Seed defaults'}
          </Button>
        ) : null}
      </div>

      {sequences.length === 0 && draft === null ? (
        <p className={'text-muted-foreground text-sm'}>No sequences yet.</p>
      ) : null}

      {error !== null && draft === null ? (
        <p className={'text-destructive text-sm'}>{error}</p>
      ) : null}

      <div className={'flex flex-col gap-3'}>
        {sequences.map((sequence) => (
          <Card key={sequence.id}>
            <CardHeader className={'flex-row items-center justify-between'}>
              <CardTitle className={'text-base'}>{sequence.name}</CardTitle>
              <Button
                type={'button'}
                size={'sm'}
                variant={'outline'}
                onClick={() => setDraft(draftFromSequence(sequence))}
              >
                Edit
              </Button>
            </CardHeader>
            <CardContent className={'flex flex-col gap-2'}>
              {sequence.description !== null ? (
                <p className={'text-muted-foreground text-sm'}>
                  {sequence.description}
                </p>
              ) : null}
              {sequence.steps.map((step) => (
                <div
                  key={step.ordinal}
                  className={'rounded border p-3 text-sm'}
                >
                  <p className={'font-medium'}>{step.subject}</p>
                  <p className={'text-muted-foreground whitespace-pre-wrap'}>
                    {step.body}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      {draft !== null ? (
        <Card>
          <CardHeader>
            <CardTitle className={'text-base'}>
              {draft.sequenceId === null ? 'New sequence' : 'Edit sequence'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className={'flex flex-col gap-4'}>
              <div className={'flex flex-col gap-2'}>
                <Label htmlFor={'sequence-name'}>Name</Label>
                <Input
                  id={'sequence-name'}
                  required
                  value={draft.name}
                  onChange={(event) =>
                    setDraft({ ...draft, name: event.target.value })
                  }
                />
              </div>

              <div className={'flex flex-col gap-2'}>
                <Label htmlFor={'sequence-description'}>Description</Label>
                <Input
                  id={'sequence-description'}
                  value={draft.description}
                  onChange={(event) =>
                    setDraft({ ...draft, description: event.target.value })
                  }
                />
              </div>

              <div className={'flex flex-col gap-2'}>
                <Label htmlFor={'sequence-subject'}>Subject</Label>
                <Input
                  id={'sequence-subject'}
                  required
                  value={draft.subject}
                  onChange={(event) =>
                    setDraft({ ...draft, subject: event.target.value })
                  }
                />
              </div>

              <div className={'flex flex-col gap-2'}>
                <Label htmlFor={'sequence-body'}>Body</Label>
                <Textarea
                  id={'sequence-body'}
                  required
                  rows={8}
                  value={draft.body}
                  onChange={(event) =>
                    setDraft({ ...draft, body: event.target.value })
                  }
                />
              </div>

              {error !== null ? (
                <p className={'text-destructive text-sm'}>{error}</p>
              ) : null}

              <div className={'flex gap-2'}>
                <Button type={'submit'} disabled={pending}>
                  {pending ? 'Saving...' : 'Save sequence'}
                </Button>
                <Button
                  type={'button'}
                  variant={'outline'}
                  onClick={() => setDraft(null)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
