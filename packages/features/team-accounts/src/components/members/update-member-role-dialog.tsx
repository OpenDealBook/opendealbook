'use client';

import { useState } from 'react';

import type { Role } from '@odb/policies';
import { Button } from '@odb/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@odb/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@odb/ui/select';

import { updateMemberRoleAction } from '../../server/members-actions';

export function UpdateMemberRoleDialog(props: {
  accountId: string;
  userId: string;
  currentRole: string;
  roles: Role[];
  onSuccess?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState(props.currentRole);
  const [pending, setPending] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Update role
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update member role</DialogTitle>
        </DialogHeader>

        <Select value={role} onValueChange={setRole}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {props.roles.map((option) => (
              <SelectItem key={option.name} value={option.name}>
                {option.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <DialogFooter>
          <Button
            disabled={pending}
            onClick={async () => {
              setPending(true);
              await updateMemberRoleAction({
                accountId: props.accountId,
                userId: props.userId,
                role,
              });
              setPending(false);
              setOpen(false);
              props.onSuccess?.();
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
