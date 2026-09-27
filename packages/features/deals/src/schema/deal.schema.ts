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
    stage: z.string().default('pre_nda'),
    notes: z.string().optional(),
  })
  .refine((value) => Boolean(value.name) || Boolean(value.description), {
    message: 'Provide a firm name or a deal description',
    path: ['description'],
  });

export type DealPayload = z.infer<typeof dealSchema>;

export const updateDealStageSchema = z.object({
  deal_id: z.uuid(),
  stage: z.string(),
});

export type UpdateDealStagePayload = z.infer<typeof updateDealStageSchema>;
