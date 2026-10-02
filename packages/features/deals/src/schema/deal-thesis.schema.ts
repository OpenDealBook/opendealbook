import { z } from 'zod';

export const dealThesisSchema = z.object({
  deal_id: z.uuid(),
  why_this_business: z.string().max(2000).optional(),
  main_concerns: z.string().max(2000).optional(),
  post_acquisition_plan: z.string().max(2500).optional(),
  owner_involvement: z.string().max(2000).optional(),
  additional_info: z.string().max(5000).optional(),
});

export type DealThesisPayload = z.infer<typeof dealThesisSchema>;
