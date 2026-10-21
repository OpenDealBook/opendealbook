import { z } from 'zod';

import { fundingSourceTypeSchema } from '@odb/calculators';

export const setCloseDeadlineSchema = z.object({
  deal_id: z.uuid(),
  must_close_by: z.iso.date().nullable(),
  must_close_reason: z.string().nullable(),
});

export const dealTermsSoughtSchema = z.object({
  deal_id: z.uuid(),
  loan_amount: z.number().nullable(),
  loan_type: fundingSourceTypeSchema.nullable(),
  term_years: z.number().nullable(),
  rate_type: z.enum(['fixed', 'variable', 'either']).nullable(),
  seller_note_amount: z.number().nullable(),
  notes: z.string().nullable(),
});

export type DealTermsSoughtPayload = z.infer<typeof dealTermsSoughtSchema>;
