'use client';

import { useActionState } from 'react';

import { Button } from '@odb/ui/button';

import { LenderSignInForm } from '../../lender/sign-in/sign-in-form';
import { confirmLenderSignIn } from './actions';

export function ConfirmSignInForm({
  tokenHash,
  next,
  destination,
}: {
  tokenHash: string;
  next: string;
  destination: string;
}) {
  const [state, confirm, pending] = useActionState(
    confirmLenderSignIn,
    'ready',
  );

  if (state === 'expired') {
    return (
      <div className={'flex flex-col gap-4'}>
        <p>This sign-in link has expired.</p>
        <LenderSignInForm next={next} />
      </div>
    );
  }

  return (
    <form action={confirm}>
      <input type={'hidden'} name={'token_hash'} value={tokenHash} />
      <input type={'hidden'} name={'next'} value={next} />
      <Button type={'submit'} disabled={pending}>
        Continue to {destination}
      </Button>
    </form>
  );
}
