import type { SupabaseClient } from '@supabase/supabase-js';

import {
  appendDealEvent,
  type DealEventInput,
  type DealMilestoneSetPayload,
} from '@odb/events';
import type { Database } from '@odb/supabase';

const UNIQUE_VIOLATION = '23505';

export async function seedLoiSignedTargets(
  client: SupabaseClient<Database>,
  { dealId, signedOn }: { dealId: string; signedOn: string },
  actor: Pick<DealEventInput, 'actorKind' | 'actorVia'>,
): Promise<void> {
  const { data: offer } = await client
    .from('offer')
    .select('current_version_id')
    .eq('deal_id', dealId)
    .eq('status', 'accepted')
    .maybeSingle()
    .throwOnError();

  if (!offer) {
    return;
  }

  const [{ data: version }, { data: existing }] = await Promise.all([
    client
      .from('offer_version')
      .select('diligence_days, exclusivity_days')
      .eq('id', offer.current_version_id!)
      .single()
      .throwOnError(),
    client
      .from('deal_milestone')
      .select('kind')
      .eq('deal_id', dealId)
      .in('kind', ['apa_signing', 'exclusivity_end'])
      .throwOnError(),
  ]);
  const kept = new Set(existing.map((milestone) => milestone.kind));

  const targets = [
    { kind: 'apa_signing', days: version.diligence_days },
    { kind: 'exclusivity_end', days: version.exclusivity_days },
  ] as const;

  for (const { kind, days } of targets) {
    if (days !== null && !kept.has(kind)) {
      await appendDealEvent(client, {
        dealId,
        aggregateType: 'deal_milestone',
        aggregateId: crypto.randomUUID(),
        eventType: 'deal_milestone.set',
        payload: {
          kind,
          target_on: addDays(signedOn, days),
          actual_on: null,
        } satisfies DealMilestoneSetPayload,
        ...actor,
      }).catch((error: { code?: string }) => {
        if (error.code !== UNIQUE_VIOLATION) {
          throw error;
        }
      });
    }
  }
}

function addDays(date: string, days: number): string {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + days);

  return next.toISOString().slice(0, 10);
}
