import { z } from 'zod';

export const leaveTeamSchema = z.object({
  accountId: z.string().uuid(),
});

export type LeaveTeamData = z.infer<typeof leaveTeamSchema>;
