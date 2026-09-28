import { z } from 'zod';

import { checklistStatusSchema, hrAuditProviderSchema } from './enums';

export const hrAuditEngagementSchema = z.object({
  deal_id: z.uuid(),
  account_id: z.uuid(),
  provider: hrAuditProviderSchema,
  vendor_name: z.string().optional(),
  vendor_contact: z.string().optional(),
  scope: z.string().optional(),
  ordered_at: z.string().optional(),
  due_at: z.string().optional(),
  report_document_id: z.uuid().optional(),
  findings_json: z.json().optional(),
  status: checklistStatusSchema.optional(),
});

export type HrAuditEngagementPayload = z.infer<typeof hrAuditEngagementSchema>;

export const updateHrAuditEngagementSchema = z.object({
  id: z.uuid(),
  provider: hrAuditProviderSchema.optional(),
  vendor_name: z.string().optional(),
  vendor_contact: z.string().optional(),
  scope: z.string().optional(),
  ordered_at: z.string().optional(),
  due_at: z.string().optional(),
  report_document_id: z.uuid().optional(),
  findings_json: z.json().optional(),
  status: checklistStatusSchema.optional(),
});

export type UpdateHrAuditEngagementPayload = z.infer<
  typeof updateHrAuditEngagementSchema
>;
