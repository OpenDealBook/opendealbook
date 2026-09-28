import { z } from 'zod';

export const hrAuditProviderSchema = z.enum(['third_party', 'internal']);

export const checklistStatusSchema = z.enum([
  'not_started',
  'requested',
  'received',
  'reviewed',
]);

export type HrAuditProvider = z.infer<typeof hrAuditProviderSchema>;
export type ChecklistStatus = z.infer<typeof checklistStatusSchema>;
