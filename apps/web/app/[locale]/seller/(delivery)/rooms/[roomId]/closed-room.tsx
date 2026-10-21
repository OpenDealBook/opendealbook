'use client';

import { useState } from 'react';

import type { ActionResult } from '@odb/lender-rooms/actions/refusal.ts';
import { requestSellerRoomAccess } from '@odb/seller-rooms/rooms/request-access.ts';
import { Button } from '@odb/ui/button';
import { Card, CardContent } from '@odb/ui/card';

function AskToReopen({ roomId }: { roomId: string }) {
  const [answer, setAnswer] = useState<ActionResult<void> | null>(null);

  if (answer?.ok) {
    return <p>Your request has been sent.</p>;
  }

  return (
    <form
      action={async () => {
        setAnswer(await requestSellerRoomAccess({ roomId }));
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

export function ClosedRoom({
  roomId,
  teamName,
  contactEmail,
  canAskToReopen,
  readOnlyReason,
}: {
  roomId: string;
  teamName: string;
  contactEmail: string;
  canAskToReopen: boolean;
  readOnlyReason: string;
}) {
  const mail = (
    <a className={'underline'} href={`mailto:${contactEmail}`}>
      {contactEmail}
    </a>
  );

  return (
    <Card>
      <CardContent className={'flex flex-col gap-2'}>
        <p className={'font-medium'}>{readOnlyReason}</p>
        {canAskToReopen ? (
          <>
            <p>
              {`To ask ${teamName} to reopen it, use the button below or write to `}
              {mail}.
            </p>
            <AskToReopen roomId={roomId} />
          </>
        ) : (
          <p>
            {`To reach ${teamName}, write to `}
            {mail}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
