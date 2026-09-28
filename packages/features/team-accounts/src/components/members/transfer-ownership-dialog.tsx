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

import { transferOwnershipAction } from '../../server/members-actions';

export function TransferOwnershipDialog(props: {
  accountId: string;
  userId: string;
  onSuccess?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Transfer ownership
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transfer ownership</DialogTitle>
          <DialogDescription>
            This member will become the primary owner of the team.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button
            disabled={pending}
            onClick={async () => {
              setPending(true);
              await transferOwnershipAction({
                accountId: props.accountId,
                userId: props.userId,
              });
              setPending(false);
              setOpen(false);
              props.onSuccess?.();
            }}
          >
            Transfer ownership
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
