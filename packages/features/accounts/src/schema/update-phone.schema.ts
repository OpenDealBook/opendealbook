import { z } from 'zod';

export const UpdatePhoneSchema = z.object({
  phone: z
    .string()
    .trim()
    .max(50)
    .transform((phone) => phone || null),
});

export type UpdatePhonePayload = z.input<typeof UpdatePhoneSchema>;
