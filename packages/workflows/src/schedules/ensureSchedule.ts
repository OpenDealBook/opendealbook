import { type Client, ScheduleAlreadyRunning, type ScheduleOptions } from '@temporalio/client';

// An existing schedule keeps its paused state so an operator's pause or unpause
// survives worker restarts; only the spec and action follow the code.
export async function ensureSchedule(client: Client, options: ScheduleOptions): Promise<void> {
  try {
    await client.schedule.create(options);
  } catch (error) {
    if (!(error instanceof ScheduleAlreadyRunning)) {
      throw error;
    }
    await client.schedule
      .getHandle(options.scheduleId)
      .update((previous) => ({ ...previous, spec: options.spec, action: options.action }));
  }
}
