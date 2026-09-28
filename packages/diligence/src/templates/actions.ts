'use server';

import { z } from 'zod';

import { enhanceAction } from '@odb/next/actions';
import type { TablesInsert } from '@odb/supabase';
import { getSupabaseServerClient } from '@odb/supabase/server';

import {
  assertChecklistsManager,
  assertDealChecklistsManager,
} from './permissions';

const createChecklistTemplateSchema = z.object({
  accountId: z.uuid(),
  name: z.string().min(1),
  category: z.string().optional(),
});

export const createChecklistTemplate = enhanceAction(
  async (input, user) => {
    const client = getSupabaseServerClient();

    await assertChecklistsManager(client, input.accountId, user.id);

    const { data, error } = await client
      .from('checklist_template')
      .insert({
        account_id: input.accountId,
        name: input.name,
        category: input.category ?? null,
        created_by: user.id,
      })
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return data;
  },
  { auth: true, schema: createChecklistTemplateSchema },
);

const addTemplateItemSchema = z.object({
  templateId: z.uuid(),
  category: z.string().optional(),
  title: z.string().min(1),
  priority: z.number().int().default(0),
  dealKiller: z.boolean().default(false),
  dueOffsetDays: z.number().int().optional(),
  sortOrder: z.number().int().default(0),
});

export const addTemplateItem = enhanceAction(
  async (input, user) => {
    const client = getSupabaseServerClient();

    const { data: template } = await client
      .from('checklist_template')
      .select('account_id')
      .eq('id', input.templateId)
      .single()
      .throwOnError();

    await assertChecklistsManager(client, template.account_id, user.id);

    const { data, error } = await client
      .from('checklist_template_item')
      .insert({
        template_id: input.templateId,
        category: input.category ?? null,
        title: input.title,
        priority: input.priority,
        deal_killer: input.dealKiller,
        due_offset_days: input.dueOffsetDays ?? null,
        sort_order: input.sortOrder,
      })
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return data;
  },
  { auth: true, schema: addTemplateItemSchema },
);

const applyTemplateToDealSchema = z.object({
  dealId: z.uuid(),
  templateId: z.uuid(),
});

export const applyTemplateToDeal = enhanceAction(
  async (input) => {
    const client = getSupabaseServerClient();

    await assertDealChecklistsManager(client, input.dealId);

    const { data: deal } = await client
      .from('deal')
      .select('account_id')
      .eq('id', input.dealId)
      .single()
      .throwOnError();

    const { data: templateItems } = await client
      .from('checklist_template_item')
      .select('*')
      .eq('template_id', input.templateId)
      .order('sort_order', { ascending: true })
      .throwOnError();

    const rows: TablesInsert<'checklist_item'>[] = templateItems.map(
      (item) => ({
        account_id: deal.account_id,
        deal_id: input.dealId,
        category: item.category,
        title: item.title,
        priority: item.priority,
        deal_killer: item.deal_killer,
        due_offset_days: item.due_offset_days,
      }),
    );

    const { data, error } = await client
      .from('checklist_item')
      .insert(rows)
      .select('*');

    if (error) {
      throw error;
    }

    return data;
  },
  { auth: true, schema: applyTemplateToDealSchema },
);
