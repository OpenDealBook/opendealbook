'use client';

import { useState } from 'react';

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

import type { z } from 'zod';

import {
  INVITABLE_ROLES,
  invitableRoleSchema,
} from '../../schema/invite-members.schema';
import { updateMemberRoleAction } from '../../server/members-actions';
import { ROLE_LABELS } from '../../role-labels';

type InvitableRole = z.infer<typeof invitableRoleSchema>;

const MERGED_ROLES: Partial<Record<string, InvitableRole>> = {
  analyst: 'member',
};

export function UpdateMemberRoleDialog(props: {
  accountId: string;
  userId: string;
  currentRole: string;
  onSuccess?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState(
    MERGED_ROLES[props.currentRole] ??
      invitableRoleSchema.safeParse(props.currentRole).data,
  );
  const [pending, setPending] = useState(false);

  const saveRole =
    role &&
    (async () => {
      setPending(true);
      await updateMemberRoleAction({
        accountId: props.accountId,
        userId: props.userId,
        role,
      });
      setPending(false);
      setOpen(false);
      props.onSuccess?.();
    });

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

        <Select
          value={role ?? ''}
          onValueChange={(value) => setRole(invitableRoleSchema.parse(value))}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={ROLE_LABELS[props.currentRole]} />
          </SelectTrigger>
          <SelectContent>
            {INVITABLE_ROLES.map((option) => (
              <SelectItem key={option} value={option}>
                {ROLE_LABELS[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <DialogFooter>
          <Button disabled={pending || !saveRole} onClick={saveRole}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
