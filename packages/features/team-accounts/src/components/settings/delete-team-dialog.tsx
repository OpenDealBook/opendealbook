'use client';

import { useState } from 'react';

import { Button } from '@tuckin/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuckin/ui/dialog';

import { deleteTeamAction } from '../../server/settings-actions';

export function DeleteTeamDialog(props: {
  accountId: string;
  isOwner: boolean;
  onSuccess?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  if (!props.isOwner) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive">Delete team</Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete team</DialogTitle>
          <DialogDescription>
            This permanently deletes the team and all of its data.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={async () => {
              setPending(true);
              await deleteTeamAction({ accountId: props.accountId });
              setPending(false);
              setOpen(false);
              props.onSuccess?.();
            }}
          >
            Delete team
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
