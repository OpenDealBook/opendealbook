import { z } from 'zod';

export const discoveryPrioritySchema = z.enum([
  'price',
  'speed',
  'legacy',
  'employees',
  'brand',
  'reputation',
]);

export const dealDiscoverySchema = z.object({
  deal_id: z.uuid(),
  counterparty_type: z.enum(['owner', 'broker']).optional(),
  call_date: z.iso.date().optional(),
  years_in_operation: z.number().int().optional(),
  reason_for_selling: z
    .enum([
      'retirement',
      'burnout',
      'new_venture',
      'health',
      'partnership_dissolution',
      'financial',
      'other',
    ])
    .optional(),
  what_matters_most: z.array(discoveryPrioritySchema).optional(),
  most_sensitive_issue: z.string().max(2000).optional(),
  owner_hours_per_week: z.number().int().optional(),
  owner_dependency: z.enum(['low', 'medium', 'high']).optional(),
  documented_processes: z.boolean().optional(),
  main_lead_source: z.string().max(2000).optional(),
  differentiation: z.string().max(2000).optional(),
  employee_count: z.number().int().optional(),
  has_management_team: z.boolean().optional(),
  revenue_trend: z.enum(['up', 'down', 'flat']).optional(),
  recurring_revenue_pct: z.number().optional(),
  clean_books: z.boolean().optional(),
  largest_customer_pct: z.number().optional(),
  estimated_margin: z.number().optional(),
  expansion_notes: z.string().max(2000).optional(),
  willing_to_train: z.boolean().optional(),
  transition_months: z.number().int().optional(),
  gaps_if_owner_leaves: z.string().max(2000).optional(),
  target_sale_date: z.iso.date().optional(),
  firm_timeline: z.boolean().optional(),
  open_to_seller_financing: z.enum(['yes', 'no', 'unsure']).optional(),
  financing_notes: z.string().max(2000).optional(),
  discovery_notes: z.string().max(5000).optional(),
});

export type DealDiscoveryPayload = z.infer<typeof dealDiscoverySchema>;
