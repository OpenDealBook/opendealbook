'use client';

import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@odb/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@odb/ui/table';

import {
  teamInvitationsQueryKey,
  useTeamInvitations,
} from '../../hooks/use-team-invitations';
import {
  resendInvitationAction,
  revokeInvitationAction,
} from '../../server/invitations-actions';
import { MemberRoleBadge } from '../members/member-role-badge';

export function InvitationsList(props: { accountId: string }) {
  const queryClient = useQueryClient();
  const { data: invitations } = useTeamInvitations(props.accountId);

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: teamInvitationsQueryKey(props.accountId),
    });

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {(invitations ?? []).map((invitation) => (
          <TableRow key={invitation.id}>
            <TableCell>{invitation.email}</TableCell>
            <TableCell>
              <MemberRoleBadge role={invitation.role} />
            </TableCell>
            <TableCell className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  await resendInvitationAction({
                    invitationId: invitation.id,
                  });
                  await invalidate();
                }}
              >
                Resend
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={async () => {
                  await revokeInvitationAction({
                    invitationId: invitation.id,
                  });
                  await invalidate();
                }}
              >
                Revoke
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
