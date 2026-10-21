import { defineSearchAttributeKey, SearchAttributeType } from '@temporalio/common';
import { log, proxyActivities, workflowInfo } from '@temporalio/workflow';

import type * as client from './client';
import type { ScheduledTrigger } from './schedule';
import { wallClockParts } from './wallClock';

const { startScheduledRun } = proxyActivities<Pick<typeof client, 'startScheduledRun'>>({
  startToCloseTimeout: '1 minute',
  retry: {
    maximumAttempts: 5,
    initialInterval: '10 seconds',
    backoffCoefficient: 2,
  },
});

const SCHEDULED_START_TIME = defineSearchAttributeKey(
  'TemporalScheduledStartTime',
  SearchAttributeType.DATETIME,
);

export async function runScheduledTrigger(trigger: ScheduledTrigger): Promise<void> {
  const started = await startScheduledRun({
    accountId: trigger.accountId,
    workflowId: trigger.workflowId,
    versionId: trigger.versionId,
    triggerRef: `${trigger.nodeId}@${localWallTime(
      workflowInfo().typedSearchAttributes.get(SCHEDULED_START_TIME)!,
      trigger.timeZone,
    )}`,
    triggerNodeId: trigger.nodeId,
  });
  if ('refused' in started) {
    log.warn('Scheduled run not started', { ...trigger, reason: started.refused });
  }
}

export function localWallTime(at: Date, timeZone: string): string {
  const { year, month, day, hour, minute } = wallClockParts(at, timeZone);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}`;
}
