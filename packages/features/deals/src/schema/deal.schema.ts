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
    source_url: z.string().optional(),
    stage: z.string().default('sourcing'),
    notes: z.string().optional(),
    industry_id: z.uuid().optional(),
    industry: z.string().optional(),
    business_model: z.string().optional(),
    location_id: z.uuid().optional(),
    location_raw: z.string().optional(),
    employee_band: z.string().optional(),
    website: z.string().optional(),
    owner_role: z.string().optional(),
    reason_for_sale: z.string().optional(),
    year_established: z.number().int().optional(),
    discovered_at: z.string().optional(),
    capture_method: z.string().optional(),
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

export const dealIdSchema = z.object({
  deal_id: z.uuid(),
});

export type DealIdPayload = z.infer<typeof dealIdSchema>;

export const setDealResolutionSchema = z
  .object({
    deal_id: z.uuid(),
    resolution: resolutionSchema,
    resolution_reason: resolutionReasonSchema.optional(),
  })
  .refine(
    (value) =>
      value.resolution !== 'lost' || value.resolution_reason !== undefined,
    {
      message: 'A reason is required when a deal is lost',
      path: ['resolution_reason'],
    },
  );

export type SetDealResolutionPayload = z.infer<typeof setDealResolutionSchema>;

export const listingStatusSchema = z.enum(['active', 'pulled', 'sold']);

export type ListingStatus = z.infer<typeof listingStatusSchema>;

export const setDealListingStatusSchema = z.object({
  deal_id: z.uuid(),
  listing_status: listingStatusSchema,
});

export type SetDealListingStatusPayload = z.infer<
  typeof setDealListingStatusSchema
>;

export const earningsBasisSchema = z.enum(['sde', 'ebitda']);

export type EarningsBasis = z.infer<typeof earningsBasisSchema>;

export const setEarningsBasisSchema = z.object({
  deal_id: z.uuid(),
  earnings_basis: earningsBasisSchema,
});

export type SetEarningsBasisPayload = z.infer<typeof setEarningsBasisSchema>;

export const adoptDealFinancialsSchema = z.object({
  deal_id: z.uuid(),
  adopted_revenue: z.number().optional(),
  adopted_sde: z.number().optional(),
  adopted_ebitda: z.number().optional(),
  source_calc_version_id: z.uuid().optional(),
});

export type AdoptDealFinancialsPayload = z.infer<
  typeof adoptDealFinancialsSchema
>;
