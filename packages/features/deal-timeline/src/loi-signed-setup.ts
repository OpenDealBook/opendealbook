import type { SupabaseClient } from '@supabase/supabase-js';

import type { DealEventInput } from '@odb/events';
import type { Database } from '@odb/supabase';

import { applyChecklistTemplateTo } from './checklist-template';
import { seedLoiSignedTargets } from './loi-signed-targets';

export async function setUpLoiSigned(
  client: SupabaseClient<Database>,
  { dealId, signedOn }: { dealId: string; signedOn: string },
  { actor, createdBy }: {
    actor: Pick<DealEventInput, 'actorKind' | 'actorVia'>;
    createdBy?: string;
  },
): Promise<void> {
  const { data: applied } = await client
    .from('deal_checklist_application')
    .select('template_id, checklist_template!inner(kind)')
    .eq('deal_id', dealId)
    .eq('checklist_template.kind', 'diligence')
    .limit(1)
    .throwOnError();

  if (applied.length === 0) {
    await applyDefaultDiligenceTemplate(client, dealId, actor);
  }

  await client
    .rpc('create_diligence_schedule', {
      p_deal_id: dealId,
      p_start_date: signedOn,
      p_created_by: createdBy,
    })
    .throwOnError();
  await seedLoiSignedTargets(client, { dealId, signedOn }, actor);

  await client
    .rpc('recompute_checklist_due_dates', { p_deal_id: dealId })
    .throwOnError();
}

async function applyDefaultDiligenceTemplate(
  client: SupabaseClient<Database>,
  dealId: string,
  actor: Pick<DealEventInput, 'actorKind' | 'actorVia'>,
) {
  const { data: deal } = await client
    .from('deal')
    .select('account_id')
    .eq('id', dealId)
    .single()
    .throwOnError();

  const { data: template } = await client
    .from('checklist_template')
    .select('id')
    .eq('account_id', deal.account_id)
    .eq('kind', 'diligence')
    .eq('is_default', true)
    .maybeSingle()
    .throwOnError();

  if (template) {
    await applyChecklistTemplateTo(
      client,
      { dealId, templateId: template.id },
      actor,
    );
  }
}
