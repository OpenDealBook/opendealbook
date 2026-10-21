import type { SupabaseClient } from '@supabase/supabase-js';

import { appendDealEvents, type DealEventInput } from '@odb/events';
import type { Database, Json } from '@odb/supabase';

const templateItemColumns =
  'title, category, priority, deal_killer, due_offset_days, review_offset_days, owner_role, importance, offer_term_key';

export async function applyChecklistTemplateTo(
  client: SupabaseClient<Database>,
  { dealId, templateId }: { dealId: string; templateId: string },
  actor: Pick<DealEventInput, 'actorKind' | 'actorVia'> = {},
) {
  const [{ data: items }, { data: template }] = await Promise.all([
    client
      .from('checklist_template_item')
      .select(templateItemColumns)
      .eq('template_id', templateId)
      .order('sort_order', { ascending: true })
      .throwOnError(),
    client
      .from('checklist_template')
      .select('kind')
      .eq('id', templateId)
      .single()
      .throwOnError(),
  ]);

  if (items.length === 0) {
    return { count: 0 };
  }

  const { data: claimed } = await client
    .rpc('claim_checklist_template_application', {
      p_deal_id: dealId,
      p_template_id: templateId,
    })
    .throwOnError();

  if (!claimed) {
    return { count: 0 };
  }

  try {
    const events = await Promise.all(
      items.map(async (item) => {
        const { data: dates } = await client
          .rpc('checklist_anchor_dates', {
            p_deal_id: dealId,
            p_kind: template.kind as string,
            p_due_offset_days: item.due_offset_days as number,
            p_review_offset_days: item.review_offset_days,
          })
          .throwOnError();

        return {
          ...actor,
          aggregateType: 'checklist_item' as const,
          aggregateId: crypto.randomUUID(),
          eventType: 'checklist_item.added' as const,
          payload: {
            ...item,
            kind: template.kind,
            source_template_id: templateId,
            due_at: dates[0]!.due_at,
            review_due_at: dates[0]!.review_due_at,
          } as Json,
        };
      }),
    );

    await appendDealEvents(client, dealId, events);
  } catch (error) {
    await client
      .from('deal_checklist_application')
      .delete()
      .eq('deal_id', dealId)
      .eq('template_id', templateId)
      .throwOnError();

    throw error;
  }

  return { count: items.length };
}
