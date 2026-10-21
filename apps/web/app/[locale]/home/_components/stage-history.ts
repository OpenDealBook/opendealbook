import type { Tables } from '@odb/supabase';

interface TimelineEntry {
  id: string;
  label: string;
  at: string;
  actor: string;
}

export function buildTimeline(
  events: Tables<'deal_event'>[],
  stageName: (key: string) => string,
  names: ReadonlyMap<string | null, string>,
): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  let lastStage: string | null = null;

  for (const event of events) {
    const payload = (event.payload ?? {}) as Record<string, unknown>;
    const stage = typeof payload.stage === 'string' ? payload.stage : null;
    const actor = names.get(event.actor_ref) ?? event.actor_kind;

    if (event.event_type === 'deal.created') {
      lastStage = stage;
      entries.push({
        id: event.id,
        label: stage === null ? 'Created' : `Created in ${stageName(stage)}`,
        at: event.created_at,
        actor,
      });
    } else if (event.event_type === 'deal.stage_changed') {
      const from = lastStage;
      lastStage = stage;
      entries.push({
        id: event.id,
        label: `${from === null ? 'Unknown' : stageName(from)} -> ${
          stage === null ? 'Unknown' : stageName(stage)
        }`,
        at: event.created_at,
        actor,
      });
    } else if (event.event_type === 'deal.resolved') {
      const resolution =
        typeof payload.resolution === 'string' ? payload.resolution : 'closed';
      const reason =
        typeof payload.resolution_reason === 'string'
          ? payload.resolution_reason
          : null;
      entries.push({
        id: event.id,
        label: `Resolved ${resolution}${
          reason === null ? '' : ` (${reason.replace(/_/g, ' ')})`
        }`,
        at: event.created_at,
        actor,
      });
    } else if (event.event_type === 'deal_update.sent') {
      entries.push({
        id: event.id,
        label: `Update sent: ${payload.subject}`,
        at: event.created_at,
        actor,
      });
    }
  }

  return entries;
}
