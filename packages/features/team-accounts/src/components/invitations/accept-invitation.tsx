'use client';

import { useState } from 'react';

import { Button } from '@odb/ui/button';

import { acceptInvitationAction } from '../../server/invitations-actions';

export function AcceptInvitation(props: {
  token: string;
  onSuccess?: (accountId: string | null) => void;
}) {
  const [pending, setPending] = useState(false);

  return (
    <Button
      disabled={pending}
      onClick={async () => {
        setPending(true);
        const result = await acceptInvitationAction({ token: props.token });
        setPending(false);
        props.onSuccess?.(result.accountId);
      }}
    >
      Accept invitation
    </Button>
  );
}
