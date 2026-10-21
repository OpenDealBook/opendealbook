import { z } from 'zod';

export const updateTeamSchema = z.object({
  accountId: z.string().uuid(),
  name: z.string().trim().min(2).max(100),
  legalEntityName: z.string().trim().max(200).optional(),
  teamPhone: z.string().trim().optional(),
});

export type UpdateTeamData = z.infer<typeof updateTeamSchema>;
