'use client';

import { useQueryClient } from '@tanstack/react-query';

import { hasPermission, type AppPermission } from '@odb/policies';
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
  invitationLinkAction,
  resendInvitationAction,
  revokeInvitationAction,
} from '../../server/invitations-actions';
import { MemberRoleBadge } from '../members/member-role-badge';

export function InvitationsList(props: {
  accountId: string;
  permissions: AppPermission[];
}) {
  const queryClient = useQueryClient();
  const { data: invitations } = useTeamInvitations(props.accountId);

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: teamInvitationsQueryKey(props.accountId),
    });

  if (invitations?.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">No pending invitations</p>
    );
  }

  const canManage = hasPermission(props.permissions, 'invites.manage');

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
              {canManage && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      const { token } = await invitationLinkAction({
                        invitationId: invitation.id,
                      });
                      await navigator.clipboard.writeText(
                        `${window.location.origin}/join?token=${token}`,
                      );
                    }}
                  >
                    Copy link
                  </Button>
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
                </>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
