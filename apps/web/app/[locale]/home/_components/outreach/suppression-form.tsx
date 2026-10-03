'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { suppressEmail } from '@odb/outreach-app/server';
import { Button } from '@odb/ui/button';
import { Input } from '@odb/ui/input';
import { Label } from '@odb/ui/label';

export function SuppressionForm({ accountId }: { accountId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        await suppressEmail({ accountId, email, reason });
        setEmail('');
        setReason('');
        router.refresh();
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : 'Could not suppress email',
        );
      }
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className={'flex max-w-xl flex-col gap-4 sm:flex-row sm:items-end'}
    >
      <div className={'flex flex-1 flex-col gap-2'}>
        <Label htmlFor={'suppress-email'}>Email</Label>
        <Input
          id={'suppress-email'}
          type={'email'}
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>

      <div className={'flex flex-1 flex-col gap-2'}>
        <Label htmlFor={'suppress-reason'}>Reason</Label>
        <Input
          id={'suppress-reason'}
          required
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </div>

      <div>
        <Button type={'submit'} disabled={pending}>
          {pending ? 'Adding...' : 'Suppress'}
        </Button>
      </div>

      {error !== null ? (
        <p className={'text-destructive text-sm'}>{error}</p>
      ) : null}
    </form>
  );
}
