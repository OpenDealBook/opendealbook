'use client';

import { useId, useState } from 'react';

import { Button } from '@odb/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@odb/ui/dialog';
import { Label } from '@odb/ui/label';
import { Textarea } from '@odb/ui/textarea';

import type { Action } from './approval-inbox';
import { useRefusableAction } from './use-refusable-action';

export type TeamFact = { id: string; body: string };

type FactActions = {
  addFact: Action<{ accountId: string; body: string }>;
  editFact: Action<{ factId: string; body: string }>;
  deleteFact: Action<{ factId: string }>;
};

export function TeamFacts(
  props: FactActions & { accountId: string; facts: TeamFact[] },
) {
  const id = useId();
  const [body, setBody] = useState('');
  const { run, refusal, pending } = useRefusableAction();

  return (
    <section className={'flex flex-col gap-4'}>
      <div className={'flex flex-col gap-1'}>
        <h2 className={'text-lg font-semibold'}>Team facts</h2>
        <p className={'text-muted-foreground text-sm'}>
          The decision model reads these on every verdict for this team.
          Override and revoke reasons land here too.
        </p>
      </div>

      {props.facts.length === 0 ? (
        <p className={'text-muted-foreground text-sm'}>
          No team facts yet. Add one below, or give a reason when you override
          or revoke.
        </p>
      ) : (
        <ul
          className={'divide-border flex flex-col divide-y rounded-md border'}
        >
          {props.facts.map((fact) => (
            <li key={fact.id} className={'p-3'}>
              <FactRow {...props} fact={fact} />
            </li>
          ))}
        </ul>
      )}

      <div className={'flex flex-col gap-2'}>
        <Label htmlFor={id}>New fact</Label>
        <Textarea
          id={id}
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
        <Button
          type={'button'}
          size={'sm'}
          className={'w-fit'}
          disabled={pending}
          onClick={() =>
            run(
              () => props.addFact({ accountId: props.accountId, body }),
              () => setBody(''),
            )
          }
        >
          Add fact
        </Button>
        {refusal ? (
          <p role={'alert'} className={'text-destructive text-sm'}>
            {refusal}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function FactRow(props: FactActions & { fact: TeamFact }) {
  const id = useId();
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const { run, refusal, pending } = useRefusableAction();

  return (
    <div className={'flex flex-col gap-2'}>
      {editing === null ? (
        <div className={'flex items-start justify-between gap-3'}>
          <p className={'text-sm whitespace-pre-wrap'}>{props.fact.body}</p>
          <div className={'flex shrink-0 gap-1'}>
            <Button
              type={'button'}
              size={'sm'}
              variant={'ghost'}
              onClick={() => setEditing(props.fact.body)}
            >
              Edit
            </Button>
            <Button
              type={'button'}
              size={'sm'}
              variant={'ghost'}
              onClick={() => setConfirmingDelete(true)}
            >
              Delete
            </Button>
          </div>
          <Dialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
            <DialogContent showCloseButton={false}>
              <DialogHeader>
                <DialogTitle>Delete this fact?</DialogTitle>
                <DialogDescription>
                  The decision model stops reading it on later verdicts.
                </DialogDescription>
              </DialogHeader>
              <p className={'text-sm whitespace-pre-wrap'}>{props.fact.body}</p>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type={'button'} variant={'outline'}>
                    Keep it
                  </Button>
                </DialogClose>
                <Button
                  type={'button'}
                  variant={'destructive'}
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => props.deleteFact({ factId: props.fact.id }),
                      () => setConfirmingDelete(false),
                    )
                  }
                >
                  Delete fact
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      ) : (
        <>
          <Label htmlFor={id} className={'sr-only'}>
            Edit fact
          </Label>
          <Textarea
            id={id}
            value={editing}
            onChange={(event) => setEditing(event.target.value)}
          />
          <div className={'flex gap-2'}>
            <Button
              type={'button'}
              size={'sm'}
              disabled={pending}
              onClick={() =>
                run(
                  () =>
                    props.editFact({ factId: props.fact.id, body: editing }),
                  () => setEditing(null),
                )
              }
            >
              Save
            </Button>
            <Button
              type={'button'}
              size={'sm'}
              variant={'ghost'}
              onClick={() => setEditing(null)}
            >
              Cancel
            </Button>
          </div>
        </>
      )}
      {refusal ? (
        <p role={'alert'} className={'text-destructive text-sm'}>
          {refusal}
        </p>
      ) : null}
    </div>
  );
}
