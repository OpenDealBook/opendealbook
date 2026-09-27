import * as z from 'zod';

export const BillingIntervalSchema = z.enum(['month', 'year']);

export const LineItemTypeSchema = z.enum(['flat', 'per_seat', 'metered']);

export const BillingProviderSchema = z.enum(['stripe', 'lemon-squeezy']);

export const LineItemSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    cost: z.number().min(0),
    type: LineItemTypeSchema,
    unit: z.string().min(1).optional(),
  })
  .refine((item) => item.type !== 'per_seat' || item.unit !== undefined, {
    message: 'Per-seat line items must define a unit',
    path: ['unit'],
  });

export const PlanSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  interval: BillingIntervalSchema,
  lineItems: z.array(LineItemSchema).min(1),
});

export const ProductSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  currency: z.string().length(3),
  plans: z.array(PlanSchema).min(1),
  features: z.array(z.string().min(1)).optional(),
});

export const BillingConfigSchema = z.object({
  provider: BillingProviderSchema,
  products: z.array(ProductSchema).min(1),
});

export type BillingInterval = z.infer<typeof BillingIntervalSchema>;
export type LineItemType = z.infer<typeof LineItemTypeSchema>;
export type BillingProvider = z.infer<typeof BillingProviderSchema>;
export type LineItem = z.infer<typeof LineItemSchema>;
export type Plan = z.infer<typeof PlanSchema>;
export type Product = z.infer<typeof ProductSchema>;
export type BillingConfig = z.infer<typeof BillingConfigSchema>;

export function createBillingConfig(
  config: z.input<typeof BillingConfigSchema>,
): BillingConfig {
  return BillingConfigSchema.parse(config);
}
