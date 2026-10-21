'use client';

import { useActionState } from 'react';

import { useSearchParams } from 'next/navigation';

import { Button } from '@odb/ui/button';

import { SellerSignInForm } from '../sign-in/sign-in-form';
import { confirmSeller } from './actions';

export function ConfirmSellerSignInForm({
  tokenHash,
  next,
}: {
  tokenHash: string;
  next: string;
}) {
  const [state, confirm, pending] = useActionState(confirmSeller, 'ready');
  const email = useSearchParams().get('email') ?? undefined;

  if (state === 'expired') {
    return (
      <div className={'flex flex-col gap-4'}>
        <p>This link was already used. We&apos;ll email you a fresh one.</p>
        <SellerSignInForm next={next} email={email} />
      </div>
    );
  }

  return (
    <form action={confirm}>
      <input type={'hidden'} name={'token_hash'} value={tokenHash} />
      <input type={'hidden'} name={'next'} value={next} />
      <Button type={'submit'} disabled={pending}>
        Continue to your room
      </Button>
    </form>
  );
}
