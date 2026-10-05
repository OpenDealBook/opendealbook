import { z } from 'zod';

export const dealWorksheetTypeSchema = z.enum([
  'margin_analysis',
  'retention_plan',
  'process_sop',
  'marketing_effectiveness',
]);

export const worksheetRowSchema = z.object({
  id: z.uuid().optional(),
  deal_id: z.uuid(),
  worksheet_type: dealWorksheetTypeSchema,
  data: z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
  sort_order: z.number().int(),
});

export type WorksheetRowPayload = z.infer<typeof worksheetRowSchema>;

export const worksheetRowIdSchema = z.object({
  id: z.uuid(),
});
