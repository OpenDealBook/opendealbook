'use client';

import { useState } from 'react';

import { Button } from '@odb/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@odb/ui/dialog';

import { leaveTeamAction } from '../../server/members-actions';

export function LeaveTeamDialog(props: {
  accountId: string;
  onSuccess?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm">
          Leave team
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Leave team</DialogTitle>
          <DialogDescription>
            You will lose access to this team.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={async () => {
              setPending(true);
              await leaveTeamAction({ accountId: props.accountId });
              setPending(false);
              setOpen(false);
              props.onSuccess?.();
            }}
          >
            Leave team
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
