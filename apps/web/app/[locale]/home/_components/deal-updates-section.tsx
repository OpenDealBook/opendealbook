'use client';

import { useState } from 'react';

import {
  createDealUpdate,
  editDealUpdate,
  submitDealUpdate,
} from '@odb/deal-updates/actions.ts';
import {
  approveDealUpdate,
  rejectDealUpdate,
} from '@odb/deal-updates/approval.ts';
import {
  belongsTo,
  RECIPIENT_GROUPS,
  resolveRecipients,
} from '@odb/deal-updates/groups.ts';
import type { DealUpdatesBoard } from '@odb/deal-updates/queries.ts';
import { type Picks, recipientGroups } from '@odb/deal-updates/schema.ts';
import { itemAnchor } from '@odb/notifications/relay';
import { Badge } from '@odb/ui/badge';
import { Button } from '@odb/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@odb/ui/card';
import { Checkbox } from '@odb/ui/checkbox';
import { Input } from '@odb/ui/input';
import { Textarea } from '@odb/ui/textarea';

import { useRefusableAction } from './use-refusable-action';

type Update = DealUpdatesBoard['updates'][number];
type Content = Pick<Update, 'subject' | 'body' | 'picks'>;

const STATUS_LABELS: Record<Update['status'], string> = {
  draft: 'Draft',
  pending: 'Pending approval',
  approved: 'Approved',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};

const DELIVERY_LABELS = { sent: 'Sent', pending: 'Pending' };

const EDITABLE: Update['status'][] = ['draft', 'pending', 'rejected'];

const BLANK: Content = {
  subject: '',
  body: '',
  picks: { groups: [], people: [] },
};

export function DealUpdatesSection({
  dealId,
  board,
}: {
  dealId: string;
  board: DealUpdatesBoard;
}) {
  const refusable = useRefusableAction();
  const { refusal, pending: isSaving } = refusable;
  const [editing, setEditing] = useState<string | null>(null);
  const nameByEmail = new Map(
    board.people.map((person) => [person.email, person.name]),
  );

  function run(action: Parameters<typeof refusable.run>[0]) {
    refusable.run(action, () => setEditing(null));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Updates</CardTitle>
      </CardHeader>
      <CardContent className={'flex flex-col gap-6'}>
        {board.canManage && editing === null ? (
          <Composer
            people={board.people}
            initial={BLANK}
            submitLabel={'Save draft'}
            disabled={isSaving}
            onSave={(content) =>
              run(() => createDealUpdate({ dealId, ...content }))
            }
          />
        ) : null}
        <ul className={'divide-y'}>
          {board.updates.map((update) =>
            editing === update.id ? (
              <li key={update.id} className={'py-4'}>
                <Composer
                  people={board.people}
                  initial={update}
                  submitLabel={'Save changes'}
                  disabled={isSaving}
                  onSave={(content) =>
                    run(() =>
                      editDealUpdate({ updateId: update.id, ...content }),
                    )
                  }
                />
              </li>
            ) : (
              <li
                key={update.id}
                id={itemAnchor({ kind: 'deal-update', id: update.id })}
                className={'flex flex-col gap-2 py-4'}
              >
                <div className={'flex flex-wrap items-center gap-2'}>
                  <span className={'font-medium'}>{update.subject}</span>
                  <Badge variant={'outline'}>
                    {STATUS_LABELS[update.status]}
                  </Badge>
                </div>
                <p className={'text-sm whitespace-pre-wrap'}>{update.body}</p>
                {update.status === 'rejected' ? (
                  <p className={'text-destructive text-sm'}>
                    Rejected: {update.decision_note}
                  </p>
                ) : null}
                <p className={'text-muted-foreground text-sm'}>
                  To{' '}
                  {[
                    ...update.picks.groups.map(
                      (group) => RECIPIENT_GROUPS[group].label,
                    ),
                    ...update.picks.people.map(
                      (email) => nameByEmail.get(email) ?? email,
                    ),
                  ].join(', ') || 'no one yet'}
                </p>
                {update.status === 'approved' ? (
                  <ul
                    aria-label={`Delivery of ${update.subject}`}
                    className={'flex flex-col gap-0.5 text-sm'}
                  >
                    {update.recipients.map(
                      ({ email, name, deleted, delivery }) => (
                        <li key={email} className={'flex flex-wrap gap-2'}>
                          <span>{deleted ? `${name} (deleted)` : name}</span>
                          <span className={'text-muted-foreground'}>
                            {email}
                          </span>
                          {delivery.state === 'failed' ? (
                            <span className={'text-destructive'}>
                              Failed: {delivery.error}
                            </span>
                          ) : (
                            <span className={'text-muted-foreground'}>
                              {DELIVERY_LABELS[delivery.state]}
                            </span>
                          )}
                        </li>
                      ),
                    )}
                  </ul>
                ) : null}
                {board.canManage && update.mine ? (
                  <div className={'flex flex-wrap items-center gap-2'}>
                    {EDITABLE.includes(update.status) ? (
                      <Button
                        type={'button'}
                        size={'sm'}
                        variant={'outline'}
                        aria-label={`Edit ${update.subject}`}
                        onClick={() => setEditing(update.id)}
                      >
                        Edit
                      </Button>
                    ) : null}
                    {update.status === 'draft' ? (
                      <Button
                        type={'button'}
                        size={'sm'}
                        disabled={isSaving}
                        aria-label={`Submit ${update.subject}`}
                        onClick={() =>
                          run(() => submitDealUpdate({ updateId: update.id }))
                        }
                      >
                        Submit for approval
                      </Button>
                    ) : null}
                    {update.status === 'draft' && !board.hasOtherApprover ? (
                      <span className={'text-destructive text-sm'}>
                        This team has no other approver, so this update cannot
                        be sent.
                      </span>
                    ) : null}
                  </div>
                ) : null}
                {board.canApprove &&
                !update.mine &&
                update.status === 'pending' ? (
                  <Decision
                    update={update}
                    recipients={resolveRecipients(board.people, update.picks)}
                    disabled={isSaving}
                    onApprove={(recipients) =>
                      run(() =>
                        approveDealUpdate({
                          updateId: update.id,
                          version: update.version,
                          recipients,
                        }),
                      )
                    }
                    onReject={(note) =>
                      run(() =>
                        rejectDealUpdate({
                          updateId: update.id,
                          version: update.version,
                          note,
                        }),
                      )
                    }
                  />
                ) : null}
              </li>
            ),
          )}
        </ul>
        {refusal ? (
          <p role={'alert'} className={'text-destructive text-sm'}>
            {refusal}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Decision({
  update,
  recipients,
  disabled,
  onApprove,
  onReject,
}: {
  update: Update;
  recipients: ReturnType<typeof resolveRecipients>;
  disabled: boolean;
  onApprove: (recipients: string[]) => void;
  onReject: (note: string) => void;
}) {
  const [note, setNote] = useState('');

  return (
    <div className={'flex flex-col gap-3 rounded-md border p-3'}>
      <div className={'flex flex-col gap-1'}>
        <span className={'text-sm font-medium'}>Will be emailed to</span>
        <ul
          aria-label={`Recipients of ${update.subject}`}
          className={'flex flex-col gap-0.5 text-sm'}
        >
          {recipients.map(({ email, name }) => (
            <li key={email} className={'flex flex-wrap gap-2'}>
              <span>{name}</span>
              <span className={'text-muted-foreground'}>{email}</span>
            </li>
          ))}
        </ul>
      </div>
      <Textarea
        aria-label={`Rejection note for ${update.subject}`}
        placeholder={'Why it is rejected (needed to reject)'}
        rows={2}
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />
      <div className={'flex flex-wrap gap-2'}>
        <Button
          type={'button'}
          size={'sm'}
          disabled={disabled}
          aria-label={`Approve ${update.subject}`}
          onClick={() => onApprove(recipients.map(({ email }) => email))}
        >
          Approve and send
        </Button>
        <Button
          type={'button'}
          size={'sm'}
          variant={'outline'}
          disabled={disabled}
          aria-label={`Reject ${update.subject}`}
          onClick={() => onReject(note)}
        >
          Reject
        </Button>
      </div>
    </div>
  );
}

function Composer({
  people,
  initial,
  submitLabel,
  disabled,
  onSave,
}: {
  people: DealUpdatesBoard['people'];
  initial: Content;
  submitLabel: string;
  disabled: boolean;
  onSave: (content: Content) => void;
}) {
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);
  const [picks, setPicks] = useState<Picks>(initial.picks);

  function toggle<Key extends keyof Picks>(
    key: Key,
    value: Picks[Key][number],
  ) {
    const chosen: Picks[Key][number][] = picks[key];

    setPicks({
      ...picks,
      [key]: chosen.includes(value)
        ? chosen.filter((item) => item !== value)
        : [...chosen, value],
    });
  }

  return (
    <div className={'flex flex-col gap-3'}>
      <Input
        aria-label={'Update subject'}
        placeholder={'Subject'}
        value={subject}
        onChange={(event) => setSubject(event.target.value)}
      />
      <Textarea
        aria-label={'Update body'}
        placeholder={'What changed, and what it means for them'}
        rows={5}
        value={body}
        onChange={(event) => setBody(event.target.value)}
      />
      <fieldset className={'flex flex-col gap-2'}>
        <legend className={'mb-2 text-sm font-medium'}>Groups</legend>
        <div className={'flex flex-wrap gap-x-5 gap-y-2'}>
          {recipientGroups.map((group) => (
            <label key={group} className={'flex items-center gap-2 text-sm'}>
              <Checkbox
                aria-label={`Send to ${RECIPIENT_GROUPS[group].label}`}
                checked={picks.groups.includes(group)}
                onCheckedChange={() => toggle('groups', group)}
              />
              {RECIPIENT_GROUPS[group].label}
              <span className={'text-muted-foreground tabular-nums'}>
                (
                {
                  people.filter(
                    (person) =>
                      person.email !== null && belongsTo(person, group),
                  ).length
                }
                )
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className={'flex flex-col gap-2'}>
        <legend className={'mb-2 text-sm font-medium'}>People</legend>
        <ul className={'flex flex-col gap-1.5'}>
          {people.map(({ email, name, entries }) => (
            <li key={email ?? entries[0]!.contact_id} className={'text-sm'}>
              {email === null ? (
                <span className={'text-muted-foreground flex gap-2'}>
                  <span>{name}</span>
                  <span>Unreachable, no email</span>
                </span>
              ) : (
                <label className={'flex flex-wrap items-center gap-2'}>
                  <Checkbox
                    aria-label={`Send to ${name}`}
                    checked={picks.people.includes(email)}
                    onCheckedChange={() => toggle('people', email)}
                  />
                  <span>{name}</span>
                  <span className={'text-muted-foreground'}>{email}</span>
                  {entries.every((entry) => entry.room_closed) ? (
                    <Badge variant={'outline'}>No open access</Badge>
                  ) : null}
                </label>
              )}
            </li>
          ))}
        </ul>
      </fieldset>
      <Button
        type={'button'}
        className={'self-start'}
        aria-label={submitLabel}
        disabled={disabled}
        onClick={() => onSave({ subject, body, picks })}
      >
        {submitLabel}
      </Button>
    </div>
  );
}
