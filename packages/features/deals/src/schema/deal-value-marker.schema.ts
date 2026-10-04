import { z } from 'zod';

export const valueMarkerRatingSchema = z.enum([
  'looks_good',
  'somewhat_risky',
  'not_good',
]);

export const valueMarkerCategorySchema = z.enum([
  'financial_viability',
  'diversification',
  'employee_risk',
  'cashflow_quality',
  'competitive_advantage',
  'customer_satisfaction',
  'recurring_revenue',
  'owner_dependency',
  'upside_potential',
  'process_maturity',
]);

export const dealValueMarkerSchema = z.object({
  deal_id: z.uuid(),
  markers: z.array(
    z.object({
      category: valueMarkerCategorySchema,
      question_key: z.string(),
      rating: valueMarkerRatingSchema.optional(),
      notes: z.string().max(5000).optional(),
    }),
  ),
});

export type DealValueMarkerPayload = z.infer<typeof dealValueMarkerSchema>;
