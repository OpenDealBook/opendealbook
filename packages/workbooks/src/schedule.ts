import type { BrokerCatchUpConfig } from '@tuckin/workflows';
import { TASK_QUEUE, getTemporalClient } from '@tuckin/workflows/client';

export interface WorkbookScheduleContext {
  workbookId: string;
  accountId: string;
  config: BrokerCatchUpConfig;
}

export interface WorkbookScheduleClient {
  startWorkbookSchedule(
    context: WorkbookScheduleContext,
  ): Promise<{ scheduleId: string }>;
  pauseWorkbookSchedule(workbookId: string): Promise<void>;
  resumeWorkbookSchedule(workbookId: string): Promise<void>;
}

export const QUARTERLY_CRON = '0 9 1 1,4,7,10 *';

export function workbookScheduleId(workbookId: string): string {
  return `workbook-${workbookId}`;
}

export function workbookWorkflowId(workbookId: string): string {
  return `broker-catch-up-${workbookId}`;
}

export function createWorkbookScheduleClient(): WorkbookScheduleClient {
  return {
    async startWorkbookSchedule(context) {
      const client = await getTemporalClient();
      const scheduleId = workbookScheduleId(context.workbookId);

      await client.schedule.create({
        scheduleId,
        spec: { cronExpressions: [QUARTERLY_CRON] },
        action: {
          type: 'startWorkflow',
          workflowType: 'brokerCatchUp',
          taskQueue: TASK_QUEUE,
          workflowId: workbookWorkflowId(context.workbookId),
          args: [
            {
              workbookId: context.workbookId,
              accountId: context.accountId,
              config: context.config,
            },
          ],
        },
      });

      return { scheduleId };
    },
    async pauseWorkbookSchedule(workbookId) {
      const client = await getTemporalClient();

      await client.schedule.getHandle(workbookScheduleId(workbookId)).pause();
    },
    async resumeWorkbookSchedule(workbookId) {
      const client = await getTemporalClient();

      await client.schedule.getHandle(workbookScheduleId(workbookId)).unpause();
    },
  };
}
