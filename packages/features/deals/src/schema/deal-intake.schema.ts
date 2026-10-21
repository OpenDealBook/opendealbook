import { z } from 'zod';

import { businessIdentityFields, hasIndustry } from './deal.schema';

export const dealIntakeDraftSchema = z.object({
  revenue: z.number().nullable(),
  sde: z.number().nullable(),
  ebitda: z.number().nullable(),
  asking_price: z.number().nullable(),
  industry: z.string().nullable(),
  location: z.string().nullable(),
  description: z.string().nullable(),
  employees: z.string().nullable(),
  business_model: z.string().nullable(),
  reason_for_sale: z.string().nullable(),
});

export type DealIntakeDraft = z.infer<typeof dealIntakeDraftSchema>;

export const extractDealIntakeFromTextSchema = z.object({
  account_id: z.uuid(),
  text: z.string().min(1),
});

export const extractDealIntakeFromPdfSchema = z.object({
  account_id: z.uuid(),
  pdf: z.string().min(1),
});

export const createDealFromIntakeSchema = z
  .object({
    account_id: z.uuid(),
    ...businessIdentityFields,
    draft: dealIntakeDraftSchema,
  })
  .refine(...hasIndustry);

export type CreateDealFromIntakePayload = z.infer<
  typeof createDealFromIntakeSchema
>;

export const rerunDealIntakeSchema = z.object({
  deal_id: z.uuid(),
  text: z.string().min(1),
});

export type RerunDealIntakePayload = z.infer<typeof rerunDealIntakeSchema>;

export const rerunDealIntakePdfSchema = z.object({
  deal_id: z.uuid(),
  pdf: z.string().min(1),
});

export type RerunDealIntakePdfPayload = z.infer<
  typeof rerunDealIntakePdfSchema
>;
