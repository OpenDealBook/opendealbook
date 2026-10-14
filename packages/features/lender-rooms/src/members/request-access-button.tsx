'use client';

import { useState } from 'react';

import { Button } from '@odb/ui/button';

import type { ActionResult } from '../actions/refusal';
import { requestLenderRoomAccess } from './actions';

export function RequestAccessButton({ roomId }: { roomId: string }) {
  const [answer, setAnswer] = useState<ActionResult<void> | null>(null);

  if (answer?.ok) {
    return <p>Your request has been sent.</p>;
  }

  return (
    <form
      action={async () => {
        setAnswer(await requestLenderRoomAccess({ roomId }));
      }}
    >
      <Button type={'submit'}>Ask to reopen</Button>
      {answer ? (
        <p role={'alert'} className={'text-destructive text-sm'}>
          {answer.refusal}
        </p>
      ) : null}
    </form>
  );
}
