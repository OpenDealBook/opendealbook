'use server';

import { z } from 'zod';

import { appendDealEvent, appendDealEvents, type DealEventInput } from '@odb/events';
import { enhanceAction } from '@odb/next/actions';
import type { Json } from '@odb/supabase';
import { getSupabaseServerClient } from '@odb/supabase/server';

const applyChecklistTemplateSchema = z.object({
  deal_id: z.uuid(),
  template_id: z.uuid(),
});

const addChecklistItemSchema = z.object({
  deal_id: z.uuid(),
  title: z.string().min(1),
});

const templateItemColumns =
  'title, category, priority, deal_killer, due_offset_days, owner_role, importance, offer_term_key';

export const applyChecklistTemplate = enhanceAction(
  async (data) => {
    const client = getSupabaseServerClient();

    const { data: items } = await client
      .from('checklist_template_item')
      .select(templateItemColumns)
      .eq('template_id', data.template_id)
      .order('sort_order', { ascending: true })
      .throwOnError();

    const templateItems = items ?? [];

    if (templateItems.length === 0) {
      return { count: 0 };
    }

    const events: DealEventInput[] = templateItems.map((item) => ({
      aggregateType: 'checklist_item',
      aggregateId: crypto.randomUUID(),
      eventType: 'checklist_item.added',
      payload: item as Json,
    }));

    await appendDealEvents(client, data.deal_id, events);

    return { count: templateItems.length };
  },
  { auth: true, schema: applyChecklistTemplateSchema },
);

export const addChecklistItem = enhanceAction(
  async (data) => {
    const client = getSupabaseServerClient();
    const itemId = crypto.randomUUID();

    await appendDealEvent(client, {
      dealId: data.deal_id,
      aggregateType: 'checklist_item',
      aggregateId: itemId,
      eventType: 'checklist_item.added',
      payload: { title: data.title },
    });

    return itemId;
  },
  { auth: true, schema: addChecklistItemSchema },
);
