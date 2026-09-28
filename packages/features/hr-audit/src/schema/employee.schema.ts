import { z } from 'zod';

export const employeeSchema = z.object({
  deal_id: z.uuid(),
  account_id: z.uuid(),
  name: z.string().min(1),
  role: z.string().optional(),
  comp: z.number().optional(),
  tenure_years: z.number().optional(),
  credentials: z.string().optional(),
  non_compete: z.boolean().optional(),
  non_solicit: z.boolean().optional(),
  key_person: z.boolean().optional(),
});

export type EmployeePayload = z.infer<typeof employeeSchema>;

export const updateEmployeeSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).optional(),
  role: z.string().optional(),
  comp: z.number().optional(),
  tenure_years: z.number().optional(),
  credentials: z.string().optional(),
  non_compete: z.boolean().optional(),
  non_solicit: z.boolean().optional(),
  key_person: z.boolean().optional(),
});

export type UpdateEmployeePayload = z.infer<typeof updateEmployeeSchema>;
