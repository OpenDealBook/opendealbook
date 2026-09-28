import { z } from 'zod';

import { checklistStatusSchema, transitionStepSchema } from './enums';

export const clientTransitionSchema = z.object({
  account_id: z.uuid(),
  deal_id: z.uuid(),
  client_name: z.string().min(1),
});

export type ClientTransitionPayload = z.infer<typeof clientTransitionSchema>;

export const updateClientTransitionStepSchema = z.object({
  id: z.uuid(),
  step: transitionStepSchema,
  status: checklistStatusSchema,
});

export type UpdateClientTransitionStepPayload = z.infer<
  typeof updateClientTransitionStepSchema
>;
