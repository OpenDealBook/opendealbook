import { z } from 'zod';

import { firmStatusSchema } from './enums';

export const firmSchema = z.object({
  account_id: z.uuid(),
  name: z.string().min(1),
  industry: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  website: z.url().optional(),
  employee_band: z.string().optional(),
  established_year: z.number().int().optional(),
  owner_name: z.string().optional(),
  owner_age_estimate: z.number().int().optional(),
  service_mix_json: z.json().optional(),
  icp_score: z.number().optional(),
  source: z.string().optional(),
  source_url: z.url().optional(),
  status: firmStatusSchema.default('imported'),
});

export type FirmPayload = z.infer<typeof firmSchema>;
