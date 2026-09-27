import { z } from 'zod';

export const UpdateEmailSchema = z
  .object({
    email: z.email(),
    repeatEmail: z.email(),
  })
  .refine((values) => values.email === values.repeatEmail, {
    path: ['repeatEmail'],
    message: 'Emails do not match',
  });

export type UpdateEmailPayload = z.infer<typeof UpdateEmailSchema>;
