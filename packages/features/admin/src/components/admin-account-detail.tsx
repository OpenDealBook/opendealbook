'use client';

import { useQueryClient } from '@tanstack/react-query';

import { Badge } from '@tuckin/ui/badge';
import { Button } from '@tuckin/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuckin/ui/card';
import { Spinner } from '@tuckin/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuckin/ui/table';

import { useAdminAccount } from '../hooks/use-admin-accounts';
import {
  banUserAction,
  reactivateUserAction,
} from '../lib/server/admin-actions';

export function AdminAccountDetail({ accountId }: { accountId: string }) {
  const queryClient = useQueryClient();
  const { data, isPending } = useAdminAccount(accountId);

  if (isPending) {
    return <Spinner />;
  }

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ['admin', 'account', accountId],
    });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{data?.account?.name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div>{data?.account?.email}</div>
          <div>{data?.account?.slug}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.memberships.map((membership) => (
                <TableRow key={membership.user_id}>
                  <TableCell>{membership.user_id}</TableCell>
                  <TableCell>{membership.account_role}</TableCell>
                  <TableCell className="space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        await banUserAction({ userId: membership.user_id });
                        await invalidate();
                      }}
                    >
                      Ban
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        await reactivateUserAction({
                          userId: membership.user_id,
                        });
                        await invalidate();
                      }}
                    >
                      Reactivate
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Subscription</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {data?.subscription ? (
            <Badge>{data.subscription.status}</Badge>
          ) : (
            <span>No subscription</span>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
