'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import type { ActionResult } from '@odb/next/refusal';
import { Button } from '@odb/ui/button';

import {
  runWorkflowNow,
  setWorkflowArchived,
  setWorkflowEnabled,
} from '../[account]/workflows/actions';

export function WorkflowRowActions({
  workflowId,
  enabled,
  archived,
}: {
  workflowId: string;
  enabled: boolean;
  archived: boolean;
}) {
  const router = useRouter();
  const [refusal, setRefusal] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function act(action: () => Promise<ActionResult<unknown>>) {
    startTransition(async () => {
      const result = await action();

      setRefusal(result.ok ? null : result.refusal);

      if (result.ok) {
        router.refresh();
      }
    });
  }

  return (
    <div className={'flex flex-wrap items-center justify-end gap-2'}>
      {archived ? (
        <Button
          type={'button'}
          variant={'outline'}
          size={'sm'}
          disabled={isPending}
          onClick={() =>
            act(() => setWorkflowArchived({ workflowId, archived: false }))
          }
        >
          Unarchive
        </Button>
      ) : (
        <>
          <Button
            type={'button'}
            variant={'outline'}
            size={'sm'}
            disabled={isPending}
            onClick={() =>
              act(() => setWorkflowEnabled({ workflowId, enabled: !enabled }))
            }
          >
            {enabled ? 'Disable' : 'Enable'}
          </Button>
          <Button
            type={'button'}
            size={'sm'}
            disabled={isPending}
            onClick={() => {
              const requestId = crypto.randomUUID();

              act(() => runWorkflowNow({ workflowId, requestId }));
            }}
          >
            Run now
          </Button>
          <Button
            type={'button'}
            variant={'ghost'}
            size={'sm'}
            disabled={isPending}
            onClick={() =>
              act(() => setWorkflowArchived({ workflowId, archived: true }))
            }
          >
            Archive
          </Button>
        </>
      )}
      {refusal ? (
        <p role={'alert'} className={'text-destructive w-full text-right text-sm'}>
          {refusal}
        </p>
      ) : null}
    </div>
  );
}
