'use client';

import { useState } from 'react';

import type { ActionResult } from '@odb/lender-rooms/actions/refusal.ts';
import { requestLenderSignInLink } from '@odb/lender-rooms/members/actions.ts';
import { Button } from '@odb/ui/button';
import { Input } from '@odb/ui/input';
import { Label } from '@odb/ui/label';

export function LenderSignInForm({ next }: { next: string }) {
  const [answer, setAnswer] = useState<ActionResult<void> | null>(null);

  async function sendLink(formData: FormData) {
    setAnswer(
      await requestLenderSignInLink({
        email: String(formData.get('email')),
        next,
      }),
    );
  }

  if (answer?.ok) {
    return (
      <p>
        If this address has access to a lender room, a sign-in link is on its
        way.
      </p>
    );
  }

  return (
    <form className={'flex flex-col gap-4'} action={sendLink}>
      <Label htmlFor={'lender-sign-in-email'}>Email</Label>
      <Input
        id={'lender-sign-in-email'}
        name={'email'}
        type={'email'}
        autoComplete={'email'}
        required
      />

      {answer ? (
        <p role={'alert'} className={'text-destructive text-sm'}>
          {answer.refusal}
        </p>
      ) : null}

      <Button type={'submit'}>Send sign-in link</Button>
    </form>
  );
}
