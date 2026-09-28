'use client';

import { useState } from 'react';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Alert, AlertDescription, AlertTitle } from '@odb/ui/alert';
import { Button } from '@odb/ui/button';
import { Spinner } from '@odb/ui/spinner';

import { generateRecoveryCodesAction } from '../../../server/mfa-recovery-server-actions';
import { RecoveryCodesDisplay } from './recovery-codes-display';
import { useRecoveryCodesStatus } from './use-recovery-codes-status';

export function RecoveryCodesManagement() {
  const status = useRecoveryCodesStatus();
  const queryClient = useQueryClient();
  const [codes, setCodes] = useState<string[] | null>(null);

  const generate = useMutation({
    mutationFn: () => generateRecoveryCodesAction(),
    onSuccess: (result) => {
      setCodes(result.codes);

      return queryClient.invalidateQueries({
        queryKey: ['mfa', 'recovery-codes', 'status'],
      });
    },
  });

  if (codes) {
    return <RecoveryCodesDisplay codes={codes} />;
  }

  return (
    <div className="flex flex-col space-y-4">
      {status.isLoading ? (
        <div className="flex items-center space-x-2">
          <Spinner />
          <span>Loading recovery code status.</span>
        </div>
      ) : null}

      {status.data?.requiresMfa ? (
        <p className="text-muted-foreground text-sm">
          Verify your two-factor authentication to manage recovery codes.
        </p>
      ) : null}

      {status.data && !status.data.requiresMfa ? (
        <RecoveryCodesStatus
          unused={status.data.unused}
          total={status.data.total}
          lastGeneratedAt={status.data.last_generated_at}
        />
      ) : null}

      {generate.isError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not generate recovery codes</AlertTitle>
          <AlertDescription>
            Recovery codes require a completed two-factor verification.
          </AlertDescription>
        </Alert>
      ) : null}

      <div>
        <Button
          type="button"
          disabled={generate.isPending}
          onClick={() => generate.mutate()}
        >
          Generate new recovery codes
        </Button>
      </div>
    </div>
  );
}

function RecoveryCodesStatus({
  unused,
  total,
  lastGeneratedAt,
}: {
  unused: number;
  total: number;
  lastGeneratedAt: string | null;
}) {
  if (total === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        You have no recovery codes yet.
      </p>
    );
  }

  return (
    <p className="text-muted-foreground text-sm">
      {unused} of {total} recovery codes remain
      {lastGeneratedAt
        ? `, generated on ${new Date(lastGeneratedAt).toLocaleDateString()}`
        : ''}
      . Generating a new set replaces the current codes.
    </p>
  );
}
