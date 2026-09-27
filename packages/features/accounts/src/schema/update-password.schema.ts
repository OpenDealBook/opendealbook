import { z } from 'zod';

export const UpdatePasswordSchema = z
  .object({
    newPassword: z.string().min(8).max(99),
    repeatPassword: z.string().min(8).max(99),
  })
  .refine((values) => values.newPassword === values.repeatPassword, {
    path: ['repeatPassword'],
    message: 'Passwords do not match',
  });

export type UpdatePasswordPayload = z.infer<typeof UpdatePasswordSchema>;
