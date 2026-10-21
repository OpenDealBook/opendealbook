import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

import { type EventLogName, startEventRun, type TriggeringEvent } from './client';
import {
  NODE_CONFIG_SCHEMAS,
  parseWorkflowGraph,
  type StepIo,
  TRIGGER_EVENT_TYPES,
} from './graph';
import { evaluateRule, MissingValue, type Rule } from './rules';

export interface LoggedEvent extends TriggeringEvent {
  accountId: string;
  xid: string;
}

export interface RelayCursor {
  xid: string;
  seq: number;
}

export async function fetchTriggerEvents(input: {
  log: EventLogName;
  after: RelayCursor;
  limit: number;
}): Promise<LoggedEvent[]> {
  const { data } = await getSupabaseServerAdminClient()
    .rpc('settled_trigger_events', {
      p_log: input.log,
      p_after_xid: input.after.xid,
      p_after_seq: input.after.seq,
      p_event_types: [...TRIGGER_EVENT_TYPES],
      p_limit: input.limit,
    })
    .throwOnError();

  return data.map((row) => ({
    log: input.log,
    xid: row.xid,
    globalSeq: row.global_seq,
    accountId: row.account_id,
    eventType: row.event_type,
    ...(row.deal_id && { dealId: row.deal_id }),
    payload: row.payload as StepIo,
  }));
}

export async function loadEventRelayCursor(name: string): Promise<RelayCursor | null> {
  const { data } = await getSupabaseServerAdminClient()
    .from('relay_cursor')
    .select('last_xid::text, last_global_seq')
    .eq('name', name)
    .maybeSingle()
    .throwOnError();

  return data && { xid: data.last_xid, seq: data.last_global_seq };
}

export async function saveEventRelayCursor(input: {
  name: string;
  cursor: RelayCursor;
}): Promise<void> {
  await getSupabaseServerAdminClient()
    .from('relay_cursor')
    .upsert({
      name: input.name,
      last_xid: input.cursor.xid,
      last_global_seq: input.cursor.seq,
    })
    .throwOnError();
}

export async function startEventRelayCursorAtLatest(input: {
  name: string;
}): Promise<RelayCursor> {
  const admin = getSupabaseServerAdminClient();
  const { data: horizon } = await admin.rpc('trigger_event_horizon').throwOnError();

  await admin
    .from('relay_cursor')
    .upsert(
      { name: input.name, last_xid: horizon, last_global_seq: 0 },
      { onConflict: 'name', ignoreDuplicates: true },
    )
    .throwOnError();

  return (await loadEventRelayCursor(input.name))!;
}

function passes(filter: Rule | undefined, payload: StepIo): boolean {
  if (!filter) {
    return true;
  }
  try {
    return evaluateRule(filter, { input: payload, steps: {} });
  } catch (error) {
    if (error instanceof MissingValue) {
      return false;
    }
    throw error;
  }
}

export async function startWorkflowRunsForEvent(event: LoggedEvent): Promise<void> {
  const { data: workflows } = await getSupabaseServerAdminClient()
    .from('workflow')
    .select('id, workflow_version(id, schema_version, graph)')
    .eq('account_id', event.accountId)
    .not('workflow_version.published_at', 'is', null)
    .order('published_at', { referencedTable: 'workflow_version', ascending: false })
    .throwOnError();

  for (const workflow of workflows) {
    const [version] = workflow.workflow_version;
    if (!version) {
      continue;
    }
    const matching = parseWorkflowGraph({
      schemaVersion: version.schema_version,
      graph: version.graph,
    }).triggers.filter((node) => {
      if (node.type !== 'event_trigger') {
        return false;
      }
      const config = NODE_CONFIG_SCHEMAS.event_trigger.parse(node.config);
      return config.eventType === event.eventType && passes(config.filter, event.payload);
    });

    for (const node of matching) {
      await startEventRun({
        accountId: event.accountId,
        workflowId: workflow.id,
        versionId: version.id,
        nodeId: node.id,
        event,
      });
    }
  }
}
