import { z } from 'zod';

export const savedViewSchema = z.object({
  account_id: z.uuid(),
  name: z.string().min(1),
  filters: z.record(z.string(), z.unknown()),
  sort: z.string().optional(),
  visible_columns: z.array(z.string()).optional(),
});

export const updateSavedViewSchema = savedViewSchema
  .omit({ account_id: true })
  .extend({ id: z.uuid() });

export const savedViewIdSchema = z.object({ id: z.uuid() });

export const listSavedViewsSchema = z.object({ account_id: z.uuid() });

export type SavedViewPayload = z.infer<typeof savedViewSchema>;
export type UpdateSavedViewPayload = z.infer<typeof updateSavedViewSchema>;
