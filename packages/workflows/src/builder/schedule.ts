import {
  type CalendarSpec,
  type Client,
  type DayOfWeek,
  ScheduleNotFoundError,
  type ScheduleSpec,
} from '@temporalio/client';

import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

import { getTemporalClient, TASK_QUEUE } from '../client';
import { ensureSchedule } from '../schedules/ensureSchedule';
import { NODE_CONFIG_SCHEMAS, type NodeConfig, parseWorkflowGraph } from './graph';
import { teamTimezone } from './team-timezone';

const THIRTY_DAY_MONTHS = ['APRIL', 'JUNE', 'SEPTEMBER', 'NOVEMBER'] as const;
const LEAP_YEARS_TO_SKIP_FEB_28 = { start: 2000, end: 2096, step: 4 };

export function scheduleSpec(
  config: NodeConfig<'schedule_trigger'>,
  timeZone: string,
): ScheduleSpec {
  if (config.every === 'hours') {
    return { calendars: [{ hour: { start: 0, end: 23, step: config.hours } }], timezone: timeZone };
  }
  const [hour, minute] = config.at.split(':').map(Number);
  const at = { hour, minute };

  switch (config.every) {
    case 'day':
      return { calendars: [at], timezone: timeZone };
    case 'week':
      return {
        calendars: [{ ...at, dayOfWeek: config.weekday.toUpperCase() as DayOfWeek }],
        timezone: timeZone,
      };
    case 'month':
      return { ...monthly(config.day, at), timezone: timeZone };
  }
}

function monthly(day: number, at: CalendarSpec): Pick<ScheduleSpec, 'calendars' | 'skip'> {
  if (day < 29) {
    return { calendars: [{ ...at, dayOfMonth: day }] };
  }
  const februaryTwentyEighth: CalendarSpec = { ...at, month: 'FEBRUARY', dayOfMonth: 28 };

  return {
    calendars: [
      { ...at, dayOfMonth: day },
      ...(day === 31 ? [{ ...at, month: [...THIRTY_DAY_MONTHS], dayOfMonth: 30 }] : []),
      ...(day > 29 ? [{ ...at, month: 'FEBRUARY' as const, dayOfMonth: 29 }] : []),
      februaryTwentyEighth,
    ],
    skip: [{ ...februaryTwentyEighth, year: LEAP_YEARS_TO_SKIP_FEB_28 }],
  };
}

export interface ScheduledTrigger {
  accountId: string;
  workflowId: string;
  versionId: string;
  nodeId: string;
  timeZone: string;
}

export async function syncTeamSchedules(input: { accountId: string }): Promise<void> {
  const timeZone = await teamTimezone(input.accountId);
  const { data: workflows } = await getSupabaseServerAdminClient()
    .from('workflow')
    .select('id')
    .eq('account_id', input.accountId)
    .throwOnError();

  const results = await Promise.allSettled(
    workflows.map((workflow) =>
      syncRememberingFailure(timeZone, { accountId: input.accountId, workflowId: workflow.id }),
    ),
  );
  const failures = results.flatMap((result, index) =>
    result.status === 'rejected' ? [{ workflowId: workflows[index]!.id, cause: result.reason }] : [],
  );

  for (const { workflowId, cause } of failures) {
    console.error(`Syncing the schedules of workflow ${workflowId} failed`, cause);
  }
  if (failures.length > 0) {
    throw new SchedulesPartlyUpdated(failures.length, workflows.length);
  }
}

export class SchedulesPartlyUpdated extends Error {
  constructor(
    readonly failed: number,
    readonly total: number,
  ) {
    super(`${failed} of ${total} workflows' schedules couldn't be updated; try again`);
  }
}

export async function syncWorkflowSchedules(input: {
  accountId: string;
  workflowId: string;
}): Promise<void> {
  await syncRememberingFailure(await teamTimezone(input.accountId), input);
}

async function syncRememberingFailure(
  timeZone: string,
  input: { accountId: string; workflowId: string },
): Promise<void> {
  try {
    await syncWorkflowSchedulesInZone(timeZone, input);
  } catch (error) {
    await setSyncFailedAt(input.workflowId, new Date().toISOString());
    throw error;
  }
  await setSyncFailedAt(input.workflowId, null);
}

async function setSyncFailedAt(workflowId: string, failedAt: string | null): Promise<void> {
  await getSupabaseServerAdminClient()
    .from('workflow')
    .update({ schedules_sync_failed_at: failedAt })
    .eq('id', workflowId)
    .throwOnError();
}

async function syncWorkflowSchedulesInZone(
  timeZone: string,
  input: { accountId: string; workflowId: string },
): Promise<void> {
  const admin = getSupabaseServerAdminClient();
  const { data: workflow } = await admin
    .from('workflow')
    .select('enabled, archived_at')
    .eq('account_id', input.accountId)
    .eq('id', input.workflowId)
    .single()
    .throwOnError();
  const { data: latest } = await admin
    .from('workflow_version')
    .select('id, schema_version, graph')
    .eq('workflow_id', input.workflowId)
    .not('published_at', 'is', null)
    .order('published_at', { ascending: false })
    .limit(1)
    .maybeSingle()
    .throwOnError();

  if (!latest) {
    return;
  }

  const temporal = await getTemporalClient();
  const scheduleNodes = parseWorkflowGraph({
    schemaVersion: latest.schema_version,
    graph: latest.graph,
  }).triggers.filter((node) => node.type === 'schedule_trigger');

  const paused = !workflow.enabled || workflow.archived_at !== null;

  for (const node of scheduleNodes) {
    const scheduleId = `workflow-trigger-${latest.id}-${node.id}`;
    await admin
      .from('workflow_trigger')
      .upsert(
        {
          account_id: input.accountId,
          workflow_id: input.workflowId,
          version_id: latest.id,
          node_id: node.id,
          kind: 'schedule',
          temporal_schedule_id: scheduleId,
        },
        { onConflict: 'version_id,node_id' },
      )
      .throwOnError();
    await ensureSchedule(temporal, {
      scheduleId,
      spec: scheduleSpec(NODE_CONFIG_SCHEMAS.schedule_trigger.parse(node.config), timeZone),
      action: {
        type: 'startWorkflow',
        workflowType: 'runScheduledTrigger',
        workflowId: scheduleId,
        taskQueue: TASK_QUEUE,
        args: [
          {
            accountId: input.accountId,
            workflowId: input.workflowId,
            versionId: latest.id,
            nodeId: node.id,
            timeZone,
          } satisfies ScheduledTrigger,
        ],
      },
      state: { paused },
    });
    await setPaused(temporal, scheduleId, paused);
  }

  const { data: superseded } = await admin
    .from('workflow_trigger')
    .select('id, temporal_schedule_id')
    .eq('workflow_id', input.workflowId)
    .neq('version_id', latest.id)
    .not('temporal_schedule_id', 'is', null)
    .throwOnError();

  for (const trigger of superseded) {
    await deleteSchedule(temporal, trigger.temporal_schedule_id!);
    await admin
      .from('workflow_trigger')
      .update({ temporal_schedule_id: null })
      .eq('id', trigger.id)
      .throwOnError();
  }
}

async function deleteSchedule(temporal: Client, scheduleId: string): Promise<void> {
  await temporal.schedule
    .getHandle(scheduleId)
    .delete()
    .catch((error: unknown) => {
      if (!(error instanceof ScheduleNotFoundError)) {
        throw error;
      }
    });
}

async function setPaused(temporal: Client, scheduleId: string, paused: boolean): Promise<void> {
  await temporal.schedule
    .getHandle(scheduleId)
    .update((previous) => ({ ...previous, state: { ...previous.state, paused } }));
}
