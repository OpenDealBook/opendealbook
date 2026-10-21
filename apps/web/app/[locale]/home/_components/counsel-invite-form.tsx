'use client';

import { useState, useTransition } from 'react';

import { inviteBuyerCounsel } from '@odb/deal-counsel/invite-buyer-counsel.ts';
import { Button } from '@odb/ui/button';
import { Input } from '@odb/ui/input';
import { Label } from '@odb/ui/label';

type Outcome = { tone: 'done' | 'problem'; text: string } | null;

export function CounselInviteForm({
  dealId,
  blockedReason,
}: {
  dealId: string;
  blockedReason: string | null;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [isInviting, startInviting] = useTransition();

  function edit(set: (value: string) => void) {
    return (value: string) => {
      set(value);
      setOutcome(null);
    };
  }

  function onInvite() {
    startInviting(async () => {
      const result = await inviteBuyerCounsel({
        dealId,
        email,
        ...(name.trim() ? { name } : {}),
      });

      setOutcome(
        result.ok
          ? { tone: 'done', text: `Invite sent to ${email}` }
          : { tone: 'problem', text: result.refusal },
      );
    });
  }

  return (
    <div className={'flex flex-col gap-3'}>
      <div className={'flex flex-col gap-2'}>
        <Label htmlFor={'counsel-invite-name'}>Name (optional)</Label>
        <Input
          id={'counsel-invite-name'}
          maxLength={200}
          value={name}
          onChange={(event) => edit(setName)(event.target.value)}
        />
      </div>
      <div className={'flex flex-col gap-2'}>
        <Label htmlFor={'counsel-invite-email'}>Email</Label>
        <Input
          id={'counsel-invite-email'}
          type={'email'}
          value={email}
          onChange={(event) => edit(setEmail)(event.target.value)}
        />
      </div>
      <div className={'flex items-center gap-3'}>
        <Button
          type={'button'}
          onClick={onInvite}
          disabled={
            isInviting || email.trim().length === 0 || blockedReason !== null
          }
        >
          {"Invite buyer's counsel"}
        </Button>
        {blockedReason ? (
          <span className={'text-muted-foreground text-sm'}>
            {blockedReason}
          </span>
        ) : null}
        {outcome ? (
          <span
            data-invite-status
            role={outcome.tone === 'problem' ? 'alert' : 'status'}
            className={
              outcome.tone === 'problem'
                ? 'text-destructive text-sm'
                : 'text-muted-foreground text-sm'
            }
          >
            {outcome.text}
          </span>
        ) : null}
      </div>
    </div>
  );
}
