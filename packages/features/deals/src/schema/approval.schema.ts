import { z } from 'zod';

import { approvalDecisionSchema, approvalSubjectSchema } from './enums';

export const approvalSchema = z.object({
  deal_id: z.uuid(),
  subject: approvalSubjectSchema,
});

export type ApprovalPayload = z.infer<typeof approvalSchema>;

export const decideApprovalSchema = z.object({
  id: z.uuid(),
  decision: approvalDecisionSchema,
});

export type DecideApprovalPayload = z.infer<typeof decideApprovalSchema>;
