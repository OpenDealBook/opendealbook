import { z } from 'zod';

export const dealBoxCriteriaSchema = z.object({
  industries: z.array(z.string()).optional(),
  naics: z.array(z.string()).optional(),
  states: z.array(z.string()).optional(),
  min_revenue: z.number().optional(),
  max_asking_price: z.number().optional(),
});

export const dealBoxSchema = z.object({
  account_id: z.uuid(),
  criteria_json: dealBoxCriteriaSchema,
  broker_summary: z.string().optional(),
});

export type DealBoxCriteria = z.infer<typeof dealBoxCriteriaSchema>;
export type DealBoxPayload = z.infer<typeof dealBoxSchema>;
