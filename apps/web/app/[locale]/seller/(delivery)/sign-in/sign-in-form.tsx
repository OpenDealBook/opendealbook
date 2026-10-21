'use client';

import { useActionState } from 'react';

import { Button } from '@odb/ui/button';
import { Input } from '@odb/ui/input';
import { Label } from '@odb/ui/label';

import { requestSellerSignInLink } from './actions';

export function SellerSignInForm({
  next,
  email,
}: {
  next: string;
  email?: string;
}) {
  const [sent, sendLink, pending] = useActionState(
    requestSellerSignInLink,
    null,
  );

  if (sent) {
    return (
      <form className={'flex flex-col gap-4'} action={sendLink}>
        <input type={'hidden'} name={'next'} value={next} />
        <input type={'hidden'} name={'email'} value={sent.email} />
        <p>If this email has access, we sent a link to {sent.email}.</p>
        <p className={'text-muted-foreground text-sm'}>
          It comes from {sent.sender}. If it is not in your inbox in a few
          minutes, check your spam folder.
        </p>
        <Button type={'submit'} variant={'outline'} disabled={pending}>
          Send a new link
        </Button>
      </form>
    );
  }

  return (
    <form className={'flex flex-col gap-4'} action={sendLink}>
      <input type={'hidden'} name={'next'} value={next} />
      <Label htmlFor={'seller-sign-in-email'}>Email</Label>
      <Input
        id={'seller-sign-in-email'}
        name={'email'}
        type={'email'}
        autoComplete={'email'}
        defaultValue={email}
        required
      />
      <Button type={'submit'} disabled={pending}>
        Send sign-in link
      </Button>
    </form>
  );
}
