'use server';

import { z } from 'zod';

import { appendDealEvent } from '@odb/events';
import { getSupabaseServerClient } from '@odb/supabase/server';

import {
  checklistImportanceSchema,
  checklistWaitingOnSchema,
} from '../schema/enums';
import { applyChecklistTemplateTo } from './checklist-template';
import { Refusal, refusableAction } from './refusal';

const applyChecklistTemplateSchema = z.object({
  deal_id: z.uuid(),
  template_id: z.uuid(),
});

const addChecklistItemSchema = z.object({
  deal_id: z.uuid(),
  title: z.string().min(1),
});

export const applyChecklistTemplate = refusableAction(
  (data) =>
    applyChecklistTemplateTo(getSupabaseServerClient(), {
      dealId: data.deal_id,
      templateId: data.template_id,
    }),
  applyChecklistTemplateSchema,
  { what: 'apply checklist templates', needs: 'checklists.manage' },
);

export const addChecklistItem = refusableAction(
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
  addChecklistItemSchema,
  { what: 'add checklist items', needs: 'checklists.manage' },
);

const setChecklistItemDetailsSchema = z.object({
  deal_id: z.uuid(),
  id: z.uuid(),
  owner_user_id: z.uuid().nullable().optional(),
  importance: checklistImportanceSchema.nullable().optional(),
  due_on: z.iso.date().nullable().optional(),
  use_scheduled_date: z.literal(true).optional(),
});

export const setChecklistItemDetails = refusableAction(
  async ({ deal_id, id, due_on, ...details }) => {
    const client = getSupabaseServerClient();

    await appendDealEvent(client, {
      dealId: deal_id,
      aggregateType: 'checklist_item',
      aggregateId: id,
      eventType: 'checklist_item.details_set',
      payload:
        due_on === undefined
          ? details
          : { ...details, due_at: due_on && `${due_on}T00:00:00Z` },
    }).catch((error: { code?: string }) => {
      if (error.code === '23514') {
        throw new Refusal('Only members of this team can own checklist items.');
      }

      throw error;
    });

    if (details.use_scheduled_date) {
      await client
        .rpc('recompute_checklist_due_dates', { p_deal_id: deal_id })
        .throwOnError();
    }
  },
  setChecklistItemDetailsSchema,
  { what: 'change checklist items', needs: 'checklists.manage' },
);

const checklistItemTarget = { deal_id: z.uuid(), id: z.uuid() };

export const setChecklistItemWaitingOn = refusableAction(
  async ({ deal_id, id, waiting_on }) => {
    await appendDealEvent(getSupabaseServerClient(), {
      dealId: deal_id,
      aggregateType: 'checklist_item',
      aggregateId: id,
      eventType: 'checklist_item.waiting_on_set',
      payload: { waiting_on },
    });
  },
  z.object({
    ...checklistItemTarget,
    waiting_on: checklistWaitingOnSchema.nullable(),
  }),
  { what: 'change checklist items', needs: 'checklists.manage' },
);

export const postChecklistNote = refusableAction(
  async ({ deal_id, id, body }) => {
    await appendDealEvent(getSupabaseServerClient(), {
      dealId: deal_id,
      aggregateType: 'checklist_item',
      aggregateId: id,
      eventType: 'checklist_item.note_posted',
      payload: { body },
    });
  },
  z.object({ ...checklistItemTarget, body: z.string().trim().min(1) }),
  { what: 'add notes to checklist items', needs: 'deals.work' },
);

export const linkChecklistDocument = refusableAction(
  async ({ deal_id, id, document_id }) => {
    await appendDealEvent(getSupabaseServerClient(), {
      dealId: deal_id,
      aggregateType: 'checklist_item',
      aggregateId: id,
      eventType: 'checklist_item.document_linked',
      payload: { document_id },
    });
  },
  z.object({ ...checklistItemTarget, document_id: z.uuid().nullable() }),
  { what: 'change checklist items', needs: 'checklists.manage' },
);
