'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import {
  createSequence,
  seedDefaultSequences,
  updateSequence,
} from '@odb/outreach-app/server';
import type { Enums } from '@odb/supabase';
import { Button } from '@odb/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@odb/ui/card';
import { Input } from '@odb/ui/input';
import { Label } from '@odb/ui/label';
import { Textarea } from '@odb/ui/textarea';

type Channel = Enums<'outreach_channel'>;

export interface SequenceStep {
  ordinal: number;
  delayDays: number;
  channel: Channel;
  subject: string | null;
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

type DraftStep = {
  key: string;
  channel: Channel;
  delayDays: string;
  subject: string;
  body: string;
};

type Draft = {
  sequenceId: string | null;
  name: string;
  description: string;
  steps: DraftStep[];
};

function emptyStep(): DraftStep {
  return { key: crypto.randomUUID(), channel: 'email', delayDays: '0', subject: '', body: '' };
}

function draftFromSequence(sequence: Sequence): Draft {
  return {
    sequenceId: sequence.id,
    name: sequence.name,
    description: sequence.description ?? '',
    steps: sequence.steps.map((step) => ({
      key: crypto.randomUUID(),
      channel: step.channel,
      delayDays: String(step.delayDays),
      subject: step.subject ?? '',
      body: step.body,
    })),
  };
}

function savedSteps(steps: DraftStep[]) {
  return steps.map((step, index) => {
    const timing = { ordinal: index + 1, delayDays: Number(step.delayDays) };
    return step.channel === 'email'
      ? { ...timing, channel: 'email' as const, subject: step.subject, body: step.body }
      : { ...timing, channel: 'letter' as const, body: step.body };
  });
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

  function changeStep(key: string, change: Partial<DraftStep>) {
    setDraft(
      (current) =>
        current && {
          ...current,
          steps: current.steps.map((step) => (step.key === key ? { ...step, ...change } : step)),
        },
    );
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft === null) {
      return;
    }

    const sequence = {
      accountId,
      name: draft.name,
      description: draft.description,
      steps: savedSteps(draft.steps),
    };

    run(() =>
      draft.sequenceId === null
        ? createSequence(sequence)
        : updateSequence({ ...sequence, sequenceId: draft.sequenceId }),
    );
  }

  return (
    <div className={'flex flex-col gap-4'}>
      <div className={'flex items-center gap-3'}>
        <Button
          type={'button'}
          size={'sm'}
          onClick={() =>
            setDraft({ sequenceId: null, name: '', description: '', steps: [emptyStep()] })
          }
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
                  <p className={'text-muted-foreground text-xs'}>
                    {step.ordinal === 1
                      ? `Day ${step.delayDays}`
                      : `${step.delayDays} days later`}
                  </p>
                  <p className={'font-medium'}>
                    {step.channel === 'letter' ? 'Letter' : step.subject}
                  </p>
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

              {draft.steps.map((step, index) => {
                const number = index + 1;
                return (
                  <fieldset
                    key={step.key}
                    className={'flex flex-col gap-3 rounded border p-3'}
                  >
                    <legend className={'text-sm font-medium'}>Step {number}</legend>
                    <div className={'flex justify-end'}>
                      <Button
                        type={'button'}
                        size={'sm'}
                        variant={'ghost'}
                        onClick={() =>
                          setDraft({
                            ...draft,
                            steps: draft.steps.filter((other) => other.key !== step.key),
                          })
                        }
                      >
                        {`Remove step ${number}`}
                      </Button>
                    </div>

                    <div className={'grid gap-3 sm:grid-cols-2'}>
                      <div className={'flex flex-col gap-2'}>
                        <Label htmlFor={`step-${step.key}-channel`}>Channel</Label>
                        <select
                          id={`step-${step.key}-channel`}
                          className={'border-input bg-background h-9 rounded-md border px-3 text-sm'}
                          value={step.channel}
                          onChange={(event) =>
                            changeStep(step.key, { channel: event.target.value as Channel })
                          }
                        >
                          <option value={'email'}>Email</option>
                          <option value={'letter'}>Letter</option>
                        </select>
                      </div>

                      <div className={'flex flex-col gap-2'}>
                        <Label htmlFor={`step-${step.key}-delay`}>
                          {index === 0 ? 'Days before sending' : 'Days after the step before'}
                        </Label>
                        <Input
                          id={`step-${step.key}-delay`}
                          type={'number'}
                          min={0}
                          required
                          value={step.delayDays}
                          onChange={(event) =>
                            changeStep(step.key, { delayDays: event.target.value })
                          }
                        />
                      </div>
                    </div>

                    {step.channel === 'email' ? (
                      <div className={'flex flex-col gap-2'}>
                        <Label htmlFor={`step-${step.key}-subject`}>Subject</Label>
                        <Input
                          id={`step-${step.key}-subject`}
                          required
                          value={step.subject}
                          onChange={(event) =>
                            changeStep(step.key, { subject: event.target.value })
                          }
                        />
                      </div>
                    ) : null}

                    <div className={'flex flex-col gap-2'}>
                      <Label htmlFor={`step-${step.key}-body`}>
                        {step.channel === 'letter' ? 'Letter' : 'Body'}
                      </Label>
                      <Textarea
                        id={`step-${step.key}-body`}
                        required
                        rows={6}
                        value={step.body}
                        onChange={(event) =>
                          changeStep(step.key, { body: event.target.value })
                        }
                      />
                    </div>
                  </fieldset>
                );
              })}

              <div>
                <Button
                  type={'button'}
                  size={'sm'}
                  variant={'outline'}
                  onClick={() => setDraft({ ...draft, steps: [...draft.steps, emptyStep()] })}
                >
                  Add step
                </Button>
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
