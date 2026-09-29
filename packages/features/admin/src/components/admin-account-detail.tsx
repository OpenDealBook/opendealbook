'use client';

import { useState } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import { Badge } from '@odb/ui/badge';
import { Button } from '@odb/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@odb/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@odb/ui/dialog';
import { Spinner } from '@odb/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@odb/ui/table';

import { useAdminAccount } from '../hooks/use-admin-accounts';
import {
  banUserAction,
  reactivateUserAction,
} from '../lib/server/admin-actions';

export function AdminAccountDetail({ accountId }: { accountId: string }) {
  const queryClient = useQueryClient();
  const { data, isPending } = useAdminAccount(accountId);
  const [banTarget, setBanTarget] = useState<string | null>(null);

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
                      onClick={() => setBanTarget(membership.user_id)}
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

      <Dialog
        open={banTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setBanTarget(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ban member</DialogTitle>
            <DialogDescription>
              This signs the member out and blocks them from signing back in
              until they are reactivated.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBanTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!banTarget) {
                  return;
                }

                await banUserAction({ userId: banTarget });
                setBanTarget(null);
                await invalidate();
              }}
            >
              Ban member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
