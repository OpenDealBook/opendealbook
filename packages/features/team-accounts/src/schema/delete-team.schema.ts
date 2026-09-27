import { z } from 'zod';

export const deleteTeamSchema = z.object({
  accountId: z.string().uuid(),
});

export type DeleteTeamData = z.infer<typeof deleteTeamSchema>;
