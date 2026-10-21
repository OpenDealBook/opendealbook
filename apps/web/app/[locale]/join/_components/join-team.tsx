'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import { Button } from '@odb/ui/button';

import { joinTeamAction } from '../_lib/join-team-action';
import { ExpiredInvite } from './expired-invite';

export function JoinTeam(props: { token: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [expired, setExpired] = useState(false);

  if (expired) {
    return <ExpiredInvite />;
  }

  return (
    <Button
      disabled={pending}
      onClick={async () => {
        setPending(true);
        const result = await joinTeamAction({ token: props.token });
        if ('expired' in result) {
          setExpired(true);
        } else {
          router.replace(result.redirectTo);
        }
      }}
    >
      Accept invitation
    </Button>
  );
}
