import {
  type Client,
  ScheduleAlreadyRunning,
  type ScheduleDescription,
  type ScheduleOptions,
  type ScheduleUpdateOptions,
} from '@temporalio/client';

export function fakeScheduleClient(existing: ScheduleOptions[] = []) {
  const schedules = new Map(existing.map((options) => [options.scheduleId, options]));

  const client = {
    schedule: {
      create: async (options: ScheduleOptions) => {
        if (schedules.has(options.scheduleId)) {
          throw new ScheduleAlreadyRunning('exists', options.scheduleId);
        }
        schedules.set(options.scheduleId, options);
      },
      getHandle: (scheduleId: string) => ({
        update: async (
          updateFn: (previous: ScheduleDescription) => ScheduleUpdateOptions,
        ) => {
          const previous = schedules.get(scheduleId) as unknown as ScheduleDescription;
          schedules.set(scheduleId, { scheduleId, ...updateFn(previous) });
        },
      }),
    },
  } as unknown as Client;

  return { client, schedules };
}

export const staleSchedule: ScheduleOptions = {
  scheduleId: 'stale',
  spec: { intervals: [{ every: '7d' }] },
  action: { type: 'startWorkflow', workflowType: 'stale', taskQueue: 'stale', args: [] },
};
