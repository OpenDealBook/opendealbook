import type { SupabaseClient } from '@supabase/supabase-js';

import { appendDealEvent, type DealMilestoneSetPayload } from '@odb/events';
import type { Database } from '@odb/supabase';

import { applyChecklistTemplateTo } from '../checklist-template';

interface LoiSigned {
  dealId: string;
  signedOn: string;
}

export async function setUpDiligenceOnLoiSigned(
  admin: SupabaseClient<Database>,
  { dealId, signedOn }: LoiSigned,
  actorVia: string,
): Promise<void> {
  const actor = { actorKind: 'service', actorVia } as const;

  const { data: deal } = await admin
    .from('deal')
    .select('account_id')
    .eq('id', dealId)
    .single()
    .throwOnError();

  const { data: template } = await admin
    .from('checklist_template')
    .select('id')
    .eq('account_id', deal.account_id)
    .eq('kind', 'diligence')
    .eq('is_default', true)
    .maybeSingle()
    .throwOnError();

  if (template) {
    await applyChecklistTemplateTo(
      admin,
      { dealId, templateId: template.id },
      actor,
    );
  }

  const { data: schedule } = await admin
    .rpc('create_diligence_schedule', {
      p_deal_id: dealId,
      p_start_date: signedOn,
    })
    .single()
    .throwOnError();

  if (schedule.created) {
    const diligenceDays = await acceptedDiligenceDays(admin, dealId);

    if (diligenceDays !== null) {
      await appendDealEvent(admin, {
        dealId,
        aggregateType: 'deal_milestone',
        aggregateId: crypto.randomUUID(),
        eventType: 'deal_milestone.set',
        payload: {
          kind: 'apa_signing',
          target_on: addDays(signedOn, diligenceDays),
          actual_on: null,
        } satisfies DealMilestoneSetPayload,
        ...actor,
      });
    }
  }

  await admin
    .rpc('recompute_checklist_due_dates', { p_deal_id: dealId })
    .throwOnError();
}

async function acceptedDiligenceDays(
  admin: SupabaseClient<Database>,
  dealId: string,
): Promise<number | null> {
  const { data: offer } = await admin
    .from('offer')
    .select('current_version_id')
    .eq('deal_id', dealId)
    .eq('status', 'accepted')
    .single()
    .throwOnError();

  const { data: version } = await admin
    .from('offer_version')
    .select('diligence_days')
    .eq('id', offer.current_version_id!)
    .single()
    .throwOnError();

  return version.diligence_days;
}

function addDays(date: string, days: number): string {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + days);

  return next.toISOString().slice(0, 10);
}
