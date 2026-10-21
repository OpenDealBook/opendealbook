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

export const afterStandbySchema = z.enum([
  'remaining_term',
  'full_term_after_standby',
]);

export const fundingSourceSchema = z.object({
  type: fundingSourceTypeSchema,
  amount: z.number(),
  pct: z.number().optional(),
  rate: z.number().optional(),
  term_years: z.number().optional(),
  guarantee_fee: z.number().optional(),
  standby_months: z.number().optional(),
  after_standby: afterStandbySchema.optional(),
  notes: z.string().optional(),
}).refine(
  (source) =>
    source.after_standby !== 'remaining_term' ||
    source.term_years == null ||
    (source.standby_months ?? 0) < source.term_years * 12,
  {
    message:
      "Standby can't be as long as the loan term when payments count from close.",
    path: ['standby_months'],
  },
);

export type AfterStandby = z.infer<typeof afterStandbySchema>;
export type FundingSourceType = z.infer<typeof fundingSourceTypeSchema>;
export type FundingSource = z.infer<typeof fundingSourceSchema>;
