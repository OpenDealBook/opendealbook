import { z } from 'zod';

export const createTeamSchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});

export type CreateTeamData = z.infer<typeof createTeamSchema>;
