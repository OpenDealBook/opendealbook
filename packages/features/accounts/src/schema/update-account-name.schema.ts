import { z } from 'zod';

export const UpdateAccountNameSchema = z.object({
  name: z.string().min(2).max(100),
});

export type UpdateAccountNamePayload = z.infer<typeof UpdateAccountNameSchema>;
