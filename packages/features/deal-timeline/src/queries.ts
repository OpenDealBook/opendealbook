import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

import { z } from 'zod';

import { Constants, type Database } from '@odb/supabase';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

import { FIXED_KINDS, FIXED_MILESTONES, type MilestoneKind } from './schema';

type Client = SupabaseClient<Database>;

export interface TimelineMilestone {
  id: string | null;
  kind: MilestoneKind;
  label: string;
  targetOn: string | null;
  actualOn: string | null;
  shared: boolean;
}

export type TimelineChange = {
  id: string;
  at: string;
  by: string;
  milestone: string;
} & (
  | {
      change: 'set';
      targetOn: string | null;
      actualOn: string | null;
      shared: boolean | null;
    }
  | { change: 'removed' }
);

export interface DealTimeline {
  canManage: boolean;
  milestones: TimelineMilestone[];
  history: TimelineChange[];
}

const setPayload = z.object({
  kind: z.enum(Constants.public.Enums.milestone_kind),
  label: z.string().optional(),
  target_on: z.iso.date().nullable(),
  actual_on: z.iso.date().nullable(),
  shared: z.boolean().optional(),
});

function milestoneName(kind: MilestoneKind, label: string | null | undefined) {
  return kind === 'custom' ? label! : FIXED_MILESTONES[kind].label;
}

export async function loadDealTimeline(
  client: Client,
  dealId: string,
): Promise<DealTimeline> {
  const [{ data: rows }, { data: events }, { data: canManage }] =
    await Promise.all([
      client
        .from('deal_milestone')
        .select('id, kind, label, target_on, actual_on, shared')
        .eq('deal_id', dealId)
        .order('created_at')
        .throwOnError(),
      client
        .from('deal_event')
        .select(
          'id, aggregate_id, event_type, payload, created_at, actor_ref, actor_via',
        )
        .eq('deal_id', dealId)
        .eq('aggregate_type', 'deal_milestone')
        .order('deal_seq')
        .throwOnError(),
      client
        .rpc('has_deal_permission', {
          deal_id: dealId,
          permission: 'deals.work',
        })
        .throwOnError(),
    ]);

  const actorIds = [
    ...new Set(events.flatMap((event) => event.actor_ref ?? [])),
  ];
  // Service role: teammates cannot read each other's personal accounts, and
  // these ids come from deal events the caller was already allowed to read.
  const { data: actors } = await getSupabaseServerAdminClient()
    .from('accounts')
    .select('primary_owner_user_id, name')
    .eq('is_personal_account', true)
    .in('primary_owner_user_id', actorIds)
    .throwOnError();
  const actorName = new Map(
    actors.map((actor) => [actor.primary_owner_user_id, actor.name]),
  );

  const toMilestone = (row: (typeof rows)[number]): TimelineMilestone => ({
    id: row.id,
    kind: row.kind,
    label: milestoneName(row.kind, row.label),
    targetOn: row.target_on,
    actualOn: row.actual_on,
    shared: row.shared,
  });

  const fixed = FIXED_KINDS.map((kind) => {
    const row = rows.find((candidate) => candidate.kind === kind);

    return row
      ? toMilestone(row)
      : {
          id: null,
          kind,
          label: FIXED_MILESTONES[kind].label,
          targetOn: null,
          actualOn: null,
          shared: FIXED_MILESTONES[kind].startsShared,
        };
  });
  const custom = rows.filter((row) => row.kind === 'custom').map(toMilestone);

  const actorLabel = (actorRef: string | null, actorVia: string | null) => {
    if (actorRef !== null) {
      return actorName.get(actorRef) ?? 'Former member';
    }

    return actorVia === 'documenso' ? 'System via Documenso' : 'System';
  };

  const nameOf = new Map<string, string>();
  const history = events.map((event): TimelineChange => {
    const origin = {
      id: event.id,
      at: event.created_at,
      by: actorLabel(event.actor_ref, event.actor_via),
    };

    if (event.event_type === 'deal_milestone.removed') {
      return {
        ...origin,
        milestone: nameOf.get(event.aggregate_id)!,
        change: 'removed',
      };
    }

    const set = setPayload.parse(event.payload);
    const milestone =
      set.kind === 'custom'
        ? set.label!
        : (nameOf.get(event.aggregate_id) ?? FIXED_MILESTONES[set.kind].label);
    nameOf.set(event.aggregate_id, milestone);

    return {
      ...origin,
      milestone,
      change: 'set',
      targetOn: set.target_on,
      actualOn: set.actual_on,
      shared: set.shared ?? null,
    };
  });

  return {
    canManage,
    milestones: [...fixed, ...custom],
    history: history.reverse(),
  };
}
