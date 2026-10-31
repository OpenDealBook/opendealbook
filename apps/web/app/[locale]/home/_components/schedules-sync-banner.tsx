'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import type { ActionResult } from '@odb/next/refusal';
import { Alert, AlertDescription } from '@odb/ui/alert';
import { Button } from '@odb/ui/button';

import { SCHEDULES_SYNC_FAILED } from '../[account]/workflows/workflow-refusals';

export function SchedulesSyncBanner(props: {
  workflowId: string;
  canManage: boolean;
  retryScheduleSync: (input: {
    workflowId: string;
  }) => Promise<ActionResult<unknown>>;
}) {
  const router = useRouter();
  const [refusal, setRefusal] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function retry() {
    startTransition(async () => {
      const result = await props.retryScheduleSync({
        workflowId: props.workflowId,
      });
      setRefusal(result.ok ? null : result.refusal);
      if (result.ok) {
        router.refresh();
      }
    });
  }

  return (
    <Alert variant={'destructive'} role={'status'}>
      <AlertDescription className={'flex flex-wrap items-center gap-3'}>
        <span>{SCHEDULES_SYNC_FAILED}</span>
        {props.canManage ? (
          <Button
            variant={'outline'}
            size={'sm'}
            disabled={pending}
            onClick={retry}
          >
            Retry schedules
          </Button>
        ) : null}
        {refusal ? <span role={'alert'}>{refusal}</span> : null}
      </AlertDescription>
    </Alert>
  );
}
