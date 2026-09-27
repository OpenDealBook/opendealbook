import { z } from 'zod';

export const updateTeamSchema = z.object({
  accountId: z.string().uuid(),
  name: z.string().trim().min(2).max(100),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});

export type UpdateTeamData = z.infer<typeof updateTeamSchema>;
