'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import {
  inviteSellerCounsel,
  type listSellerCounsel,
} from '@odb/deal-counsel/invite-seller-counsel.ts';
import { Button } from '@odb/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@odb/ui/card';
import { Input } from '@odb/ui/input';
import { Label } from '@odb/ui/label';

type Outcome = { tone: 'done' | 'problem'; text: string } | null;

type Counsel = Awaited<ReturnType<typeof listSellerCounsel>>[number];

export function SellerCounselInvite({
  dealId,
  counsel,
  readOnly = false,
}: {
  dealId: string;
  counsel: Counsel[];
  readOnly?: boolean;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [invitingAnother, setInvitingAnother] = useState(false);
  const [isInviting, startInviting] = useTransition();
  const router = useRouter();

  function edit(set: (value: string) => void) {
    return (value: string) => {
      set(value);
      setOutcome(null);
    };
  }

  function onInvite(invite: { email: string; name?: string }) {
    startInviting(async () => {
      const result = await inviteSellerCounsel({ dealId, ...invite });

      setOutcome(
        result.ok
          ? { tone: 'done', text: `Invite sent to ${invite.email}` }
          : { tone: 'problem', text: result.refusal },
      );

      if (result.ok) {
        setInvitingAnother(false);
        router.refresh();
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your counsel</CardTitle>
      </CardHeader>
      <CardContent className={'flex flex-col gap-3'}>
        <p className={'text-muted-foreground text-sm'}>
          Your counsel can see and comment on the files, uploads and questions
          in this room.
        </p>
        {counsel.map((invited) => (
          <div key={invited.email} className={'flex items-center gap-3'}>
            <span className={'text-sm'}>
              {invited.name ?? invited.email}, invited{' '}
              {new Date(invited.invitedAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                timeZone: 'UTC',
              })}
              , {invited.joined ? 'joined' : 'not yet joined'}
            </span>
            {readOnly ? null : (
              <Button
                type={'button'}
                variant={'outline'}
                size={'sm'}
                onClick={() => onInvite({ email: invited.email })}
                disabled={isInviting}
              >
                Resend
              </Button>
            )}
          </div>
        ))}
        {readOnly ? null : counsel.length > 0 && !invitingAnother ? (
          <Button
            type={'button'}
            variant={'link'}
            className={'self-start px-0'}
            onClick={() => setInvitingAnother(true)}
          >
            Invite another
          </Button>
        ) : (
          <>
            <div className={'flex flex-col gap-2'}>
              <Label htmlFor={'seller-counsel-name'}>Name (optional)</Label>
              <Input
                id={'seller-counsel-name'}
                maxLength={200}
                value={name}
                onChange={(event) => edit(setName)(event.target.value)}
              />
            </div>
            <div className={'flex flex-col gap-2'}>
              <Label htmlFor={'seller-counsel-email'}>Email</Label>
              <Input
                id={'seller-counsel-email'}
                type={'email'}
                value={email}
                onChange={(event) => edit(setEmail)(event.target.value)}
              />
            </div>
            <Button
              type={'button'}
              onClick={() =>
                onInvite({ email, ...(name.trim() ? { name } : {}) })
              }
              disabled={isInviting || email.trim().length === 0}
            >
              Invite your counsel
            </Button>
          </>
        )}
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
      </CardContent>
    </Card>
  );
}
