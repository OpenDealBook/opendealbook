import { z } from 'zod';

export const dealOperatingPeriodSchema = z.object({
  deal_id: z.uuid(),
  period_month: z.iso.date(),
  revenue: z.number().optional(),
  cogs: z.number().optional(),
  opex: z.number().optional(),
  cash_balance: z.number().optional(),
  headcount: z.number().int().optional(),
  debt_service: z.number().optional(),
  notes: z.string().max(5000).optional(),
});

export type DealOperatingPeriodPayload = z.infer<
  typeof dealOperatingPeriodSchema
>;
