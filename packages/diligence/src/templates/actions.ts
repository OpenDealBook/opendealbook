'use server';

import { z } from 'zod';

import { enhanceAction } from '@odb/next/actions';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { checklistsRefusal } from './permissions';

type Outcome<Value> =
  | { ok: true; value: Value }
  | { ok: false; refusal: string };

type ServerClient = ReturnType<typeof getSupabaseServerClient>;

async function whenAllowed<Value>(
  client: ServerClient,
  accountId: string,
  userId: string,
  write: () => PromiseLike<Value>,
): Promise<Outcome<Value>> {
  const refusal = await checklistsRefusal(client, accountId, userId);

  return refusal ? { ok: false, refusal } : { ok: true, value: await write() };
}

async function accountOfTemplate(
  client: ServerClient,
  templateId: string,
): Promise<string> {
  const { data } = await client
    .from('checklist_template')
    .select('account_id')
    .eq('id', templateId)
    .single()
    .throwOnError();

  return data.account_id;
}

async function accountOfItem(
  client: ServerClient,
  itemId: string,
): Promise<string> {
  const { data } = await client
    .from('checklist_template_item')
    .select('template:checklist_template!inner(account_id)')
    .eq('id', itemId)
    .single()
    .throwOnError();

  return data.template.account_id;
}

const kindSchema = z.enum(['offer', 'diligence', 'closing', 'post_close']);
const ownerRoleSchema = z.enum([
  'buyer',
  'attorney',
  'cpa',
  'broker',
  'seller',
  'sales_team',
]);
const importanceSchema = z.enum(['required', 'nice_to_have', 'na']);

const createChecklistTemplateSchema = z.object({
  accountId: z.uuid(),
  name: z.string().min(1),
  kind: kindSchema,
  category: z.string().optional(),
});

export const createChecklistTemplate = enhanceAction(
  async (input, user) => {
    const client = getSupabaseServerClient();

    return whenAllowed(client, input.accountId, user.id, async () => {
      const { data } = await client
        .from('checklist_template')
        .insert({
          account_id: input.accountId,
          name: input.name,
          kind: input.kind,
          category: input.category ?? null,
          created_by: user.id,
        })
        .select('*')
        .single()
        .throwOnError();

      return data;
    });
  },
  { auth: true, schema: createChecklistTemplateSchema },
);

const renameChecklistTemplateSchema = z.object({
  templateId: z.uuid(),
  name: z.string().min(1),
});

export const renameChecklistTemplate = enhanceAction(
  async (input, user) => {
    const client = getSupabaseServerClient();
    const accountId = await accountOfTemplate(client, input.templateId);

    return whenAllowed(client, accountId, user.id, async () => {
      await client
        .from('checklist_template')
        .update({ name: input.name })
        .eq('id', input.templateId)
        .throwOnError();
    });
  },
  { auth: true, schema: renameChecklistTemplateSchema },
);

const addTemplateItemSchema = z.object({
  templateId: z.uuid(),
  category: z.string().optional(),
  title: z.string().min(1),
  priority: z.number().int().optional(),
  dealKiller: z.boolean().optional(),
  dueOffsetDays: z.number().int().optional(),
  reviewOffsetDays: z.number().int().optional(),
  ownerRole: ownerRoleSchema.optional(),
  importance: importanceSchema.optional(),
  sortOrder: z.number().int().optional(),
});

export const addTemplateItem = enhanceAction(
  async (input, user) => {
    const client = getSupabaseServerClient();
    const accountId = await accountOfTemplate(client, input.templateId);

    return whenAllowed(client, accountId, user.id, async () => {
      const { data } = await client
        .from('checklist_template_item')
        .insert({
          template_id: input.templateId,
          category: input.category ?? null,
          title: input.title,
          priority: input.priority,
          deal_killer: input.dealKiller,
          due_offset_days: input.dueOffsetDays ?? null,
          review_offset_days: input.reviewOffsetDays,
          owner_role: input.ownerRole ?? null,
          importance: input.importance ?? null,
          sort_order: input.sortOrder,
        })
        .select('*')
        .single()
        .throwOnError();

      return data;
    });
  },
  { auth: true, schema: addTemplateItemSchema },
);

const updateTemplateItemSchema = z.object({
  itemId: z.uuid(),
  title: z.string().min(1),
  category: z.string().nullable(),
  dueOffsetDays: z.number().int().nullable(),
  reviewOffsetDays: z.number().int(),
  ownerRole: ownerRoleSchema.nullable(),
  importance: importanceSchema.nullable(),
});

export const updateTemplateItem = enhanceAction(
  async (input, user) => {
    const client = getSupabaseServerClient();
    const accountId = await accountOfItem(client, input.itemId);

    return whenAllowed(client, accountId, user.id, async () => {
      await client
        .from('checklist_template_item')
        .update({
          title: input.title,
          category: input.category,
          due_offset_days: input.dueOffsetDays,
          review_offset_days: input.reviewOffsetDays,
          owner_role: input.ownerRole,
          importance: input.importance,
        })
        .eq('id', input.itemId)
        .throwOnError();
    });
  },
  { auth: true, schema: updateTemplateItemSchema },
);

const removeTemplateItemSchema = z.object({ itemId: z.uuid() });

export const removeTemplateItem = enhanceAction(
  async (input, user) => {
    const client = getSupabaseServerClient();
    const accountId = await accountOfItem(client, input.itemId);

    return whenAllowed(client, accountId, user.id, async () => {
      await client
        .from('checklist_template_item')
        .delete()
        .eq('id', input.itemId)
        .throwOnError();
    });
  },
  { auth: true, schema: removeTemplateItemSchema },
);

const reorderTemplateItemsSchema = z.object({
  templateId: z.uuid(),
  itemIds: z.array(z.uuid()),
});

export const reorderTemplateItems = enhanceAction(
  async (input, user) => {
    const client = getSupabaseServerClient();
    const accountId = await accountOfTemplate(client, input.templateId);

    return whenAllowed(client, accountId, user.id, async () => {
      const { data: items } = await client
        .from('checklist_template_item')
        .select('id, template_id, title')
        .eq('template_id', input.templateId)
        .in('id', input.itemIds)
        .throwOnError();

      const byId = new Map(items.map((item) => [item.id, item]));

      await client
        .from('checklist_template_item')
        .upsert(
          input.itemIds.map((id, index) => ({
            ...byId.get(id)!,
            sort_order: index,
          })),
        )
        .throwOnError();
    });
  },
  { auth: true, schema: reorderTemplateItemsSchema },
);

const setDefaultChecklistTemplateSchema = z.object({ templateId: z.uuid() });

export const setDefaultChecklistTemplate = enhanceAction(
  async (input, user) => {
    const client = getSupabaseServerClient();
    const accountId = await accountOfTemplate(client, input.templateId);

    return whenAllowed(client, accountId, user.id, async () => {
      await client
        .rpc('set_default_checklist_template', {
          template_id: input.templateId,
        })
        .throwOnError();
    });
  },
  { auth: true, schema: setDefaultChecklistTemplateSchema },
);
