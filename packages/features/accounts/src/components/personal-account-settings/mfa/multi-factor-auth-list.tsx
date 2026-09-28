'use client';

import { useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useSupabase } from '@odb/supabase/hooks';
import { Alert, AlertDescription, AlertTitle } from '@odb/ui/alert';
import { Badge } from '@odb/ui/badge';
import { Button } from '@odb/ui/button';
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

import { MultiFactorAuthSetupDialog } from './multi-factor-auth-setup-dialog';

const FACTORS_QUERY_KEY = ['mfa', 'factors'];

export function MultiFactorAuthList() {
  const client = useSupabase();
  const queryClient = useQueryClient();
  const [unenrolling, setUnenrolling] = useState<string | null>(null);

  const factors = useQuery({
    queryKey: FACTORS_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await client.auth.mfa.listFactors();

      if (error) {
        throw error;
      }

      return data.all;
    },
  });

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: FACTORS_QUERY_KEY });

  const unenroll = useMutation({
    mutationFn: async (factorId: string) => {
      const { error } = await client.auth.mfa.unenroll({ factorId });

      if (error) {
        throw error;
      }
    },
    onSuccess: () => {
      setUnenrolling(null);

      return refresh();
    },
  });

  return (
    <div className="flex flex-col space-y-4">
      {factors.isLoading ? (
        <div className="flex items-center space-x-2">
          <Spinner />
          <span>Loading factors.</span>
        </div>
      ) : null}

      {factors.isError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load factors</AlertTitle>
          <AlertDescription>
            Your two-factor methods could not be loaded.
          </AlertDescription>
        </Alert>
      ) : null}

      {factors.data && factors.data.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {factors.data.map((factor) => (
              <TableRow key={factor.id}>
                <TableCell className="truncate">
                  {factor.friendly_name ?? 'Authenticator'}
                </TableCell>
                <TableCell>
                  <Badge className="uppercase">{factor.factor_type}</Badge>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      factor.status === 'verified' ? 'default' : 'outline'
                    }
                    className="capitalize"
                  >
                    {factor.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    onClick={() => setUnenrolling(factor.id)}
                  >
                    Remove
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}

      <div>
        <MultiFactorAuthSetupDialog onEnrolled={refresh} />
      </div>

      <Dialog
        open={unenrolling !== null}
        onOpenChange={(next) => {
          if (!next) {
            setUnenrolling(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this factor</DialogTitle>
            <DialogDescription>
              You will no longer be prompted for this method when you sign in.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setUnenrolling(null)}>
              Cancel
            </Button>
            <Button
              disabled={unenroll.isPending}
              onClick={() => unenroll.mutate(unenrolling!)}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
