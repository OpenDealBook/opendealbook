import { z } from 'zod';

import {
  checklistImportanceSchema,
  checklistKindSchema,
  checklistOutcomeSchema,
  checklistOwnerRoleSchema,
  checklistStatusSchema,
} from './enums';

export const checklistItemSchema = z.object({
  account_id: z.uuid(),
  deal_id: z.uuid(),
  category: z.string(),
  title: z.string().min(1),
  owner_user_id: z.uuid().optional(),
  due_at: z.string().optional(),
  due_offset_days: z.number().int().optional(),
  artifact_type: z.string().optional(),
  artifact_id: z.uuid().optional(),
  kind: checklistKindSchema.optional(),
  owner_role: checklistOwnerRoleSchema.optional(),
  importance: checklistImportanceSchema.optional(),
  answer: z.string().optional(),
  offer_term_key: z.string().optional(),
});

export type ChecklistItemPayload = z.infer<typeof checklistItemSchema>;

export const updateChecklistItemStatusSchema = z.object({
  id: z.uuid(),
  status: checklistStatusSchema,
  outcome: checklistOutcomeSchema.optional(),
  answer: z.string().optional(),
});

export type UpdateChecklistItemStatusPayload = z.infer<
  typeof updateChecklistItemStatusSchema
>;
