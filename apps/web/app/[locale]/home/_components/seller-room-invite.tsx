'use client';

import { useState, useTransition } from 'react';

import { inviteSeller } from '@odb/seller-rooms/members/actions.ts';
import { Button } from '@odb/ui/button';
import { Input } from '@odb/ui/input';
import { Label } from '@odb/ui/label';

type Outcome = { tone: 'done' | 'problem'; text: string } | null;

export function SellerRoomInvite({
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

  const ready = name.trim().length > 0 && email.trim().length > 0;

  function edit(set: (value: string) => void) {
    return (value: string) => {
      set(value);
      setOutcome(null);
    };
  }

  function onInvite() {
    startInviting(async () => {
      try {
        const result = await inviteSeller({ dealId, name, email });

        setOutcome(
          result.ok
            ? { tone: 'done', text: `Invite sent to ${email}` }
            : { tone: 'problem', text: result.refusal },
        );
      } catch {
        setOutcome({
          tone: 'problem',
          text: 'The invite was not sent. Try again.',
        });
      }
    });
  }

  return (
    <div className={'flex flex-col gap-3'}>
      <div className={'flex flex-col gap-2'}>
        <Label htmlFor={'seller-invite-name'}>Seller name</Label>
        <Input
          id={'seller-invite-name'}
          maxLength={200}
          value={name}
          onChange={(event) => edit(setName)(event.target.value)}
        />
      </div>
      <div className={'flex flex-col gap-2'}>
        <Label htmlFor={'seller-invite-email'}>Seller email</Label>
        <Input
          id={'seller-invite-email'}
          type={'email'}
          value={email}
          onChange={(event) => edit(setEmail)(event.target.value)}
        />
      </div>
      <div className={'flex items-center gap-3'}>
        <Button
          type={'button'}
          onClick={onInvite}
          disabled={isInviting || !ready || blockedReason !== null}
        >
          {isInviting ? 'Inviting' : 'Invite seller'}
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
