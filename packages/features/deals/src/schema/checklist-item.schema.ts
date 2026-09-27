import { z } from 'zod';

import { checklistOutcomeSchema, checklistStatusSchema } from './enums';

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
});

export type ChecklistItemPayload = z.infer<typeof checklistItemSchema>;

export const updateChecklistItemStatusSchema = z.object({
  id: z.uuid(),
  status: checklistStatusSchema,
  outcome: checklistOutcomeSchema.optional(),
});

export type UpdateChecklistItemStatusPayload = z.infer<
  typeof updateChecklistItemStatusSchema
>;
