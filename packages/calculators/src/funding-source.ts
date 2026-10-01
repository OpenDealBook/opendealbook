import { z } from 'zod';

export const fundingSourceTypeSchema = z.enum([
  'sba_7a',
  'sba_504',
  'conventional',
  'seller_financing',
  'cash_equity',
  'heloc',
  'robs_401k',
  'investor_equity',
  'mezzanine',
  'other',
]);

export const fundingSourceSchema = z.object({
  type: fundingSourceTypeSchema,
  amount: z.number(),
  pct: z.number().optional(),
  rate: z.number().optional(),
  term_years: z.number().optional(),
  guarantee_fee: z.number().optional(),
  standby_months: z.number().optional(),
  notes: z.string().optional(),
});

export type FundingSourceType = z.infer<typeof fundingSourceTypeSchema>;
export type FundingSource = z.infer<typeof fundingSourceSchema>;
