import { z } from 'zod';

export const createTeamSchema = z.object({
  name: z.string().trim().min(2).max(100),
});

export type CreateTeamData = z.infer<typeof createTeamSchema>;
