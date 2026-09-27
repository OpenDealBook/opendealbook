import * as z from 'zod';

import {
  BillingIntervalSchema,
  LineItemTypeSchema,
} from './billing-config.schema';

export const SubscriptionStatusSchema = z.enum([
  'active',
  'trialing',
  'past_due',
  'canceled',
  'unpaid',
  'incomplete',
  'incomplete_expired',
  'paused',
]);

export const SubscriptionLineItemSchema = z.object({
  id: z.string().min(1),
  productId: z.string().min(1),
  variantId: z.string().min(1),
  quantity: z.number().int().min(0),
  interval: BillingIntervalSchema,
  intervalCount: z.number().int().positive(),
  type: LineItemTypeSchema,
});

export const SubscriptionSchema = z.object({
  id: z.string().min(1),
  accountId: z.string().min(1),
  customerId: z.string().min(1),
  status: SubscriptionStatusSchema,
  currency: z.string().length(3),
  cancelAtPeriodEnd: z.boolean(),
  periodStartsAt: z.string(),
  periodEndsAt: z.string(),
  trialStartsAt: z.string().nullable(),
  trialEndsAt: z.string().nullable(),
  lineItems: z.array(SubscriptionLineItemSchema).min(1),
});

export type SubscriptionStatus = z.infer<typeof SubscriptionStatusSchema>;
export type SubscriptionLineItem = z.infer<typeof SubscriptionLineItemSchema>;
export type Subscription = z.infer<typeof SubscriptionSchema>;
