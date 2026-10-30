'use client';

import { useState } from 'react';

import { Button } from '@odb/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@odb/ui/card';

import { useRefusableAction } from '../../_components/use-refusable-action';
import {
  retryTeamScheduleSyncAction,
  updateTeamTimezoneAction,
} from './team-timezone-actions';

export function TeamTimezoneSetting({
  accountId,
  current,
  zones,
  canManage,
}: {
  accountId: string;
  current: string | null;
  zones: string[];
  canManage: boolean;
}) {
  const { refusal, pending, run } = useRefusableAction();
  const [schedulesError, setSchedulesError] = useState<string | null>(null);

  function settle(result: { schedulesError: string | null }) {
    setSchedulesError(result.schedulesError);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Time zone</CardTitle>
        <CardDescription>
          Used for workflow schedules, waits and to-do due dates.
        </CardDescription>
      </CardHeader>
      <CardContent className={'flex flex-col items-start gap-2'}>
        <select
          aria-label={'Time zone'}
          className={'bg-background h-9 rounded-md border px-2 text-sm'}
          defaultValue={current ?? 'UTC'}
          disabled={!canManage || pending}
          onChange={(event) => {
            const timezone = event.target.value;
            run(
              () => updateTeamTimezoneAction({ accountId, timezone }),
              settle,
            );
          }}
        >
          {zones.map((zone) => (
            <option key={zone} value={zone}>
              {zone.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
        {refusal ?? schedulesError ? (
          <p role={'alert'} className={'text-destructive text-sm'}>
            {refusal ?? schedulesError}
          </p>
        ) : null}
        {schedulesError ? (
          <Button
            type={'button'}
            variant={'outline'}
            size={'sm'}
            disabled={pending}
            onClick={() =>
              run(() => retryTeamScheduleSyncAction({ accountId }), settle)
            }
          >
            Try again
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
