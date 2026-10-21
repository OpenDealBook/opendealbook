import { z } from 'zod';

export const UpdateTimezoneSchema = z.object({
  timezone: z.string().min(1),
});

export type UpdateTimezonePayload = z.infer<typeof UpdateTimezoneSchema>;
