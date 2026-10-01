import { z } from 'zod';

import { dealSourceSchema } from './enums';

export const dealSchema = z
  .object({
    account_id: z.uuid(),
    firm_id: z.uuid().optional(),
    name: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    asking_price: z.number().optional(),
    revenue_ttm: z.number().optional(),
    sde_ttm: z.number().optional(),
    ebitda_ttm: z.number().optional(),
    source: dealSourceSchema.default('manual'),
    stage: z.string().default('sourcing'),
    notes: z.string().optional(),
  })
  .refine((value) => Boolean(value.name) || Boolean(value.description), {
    message: 'Provide a firm name or a deal description',
    path: ['description'],
  });

export type DealPayload = z.infer<typeof dealSchema>;

export const resolutionSchema = z.enum(['won', 'lost']);

export const resolutionReasonSchema = z.enum([
  'closed',
  'offer_not_made',
  'offer_not_accepted',
  'deal_did_not_close',
  'listing_pulled_or_sold',
  'other',
]);

export type Resolution = z.infer<typeof resolutionSchema>;
export type ResolutionReason = z.infer<typeof resolutionReasonSchema>;

export const updateDealStageSchema = z.object({
  deal_id: z.uuid(),
  stage: z.string(),
});

export type UpdateDealStagePayload = z.infer<typeof updateDealStageSchema>;
