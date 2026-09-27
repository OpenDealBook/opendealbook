import { z } from 'zod';

export const removeMemberSchema = z.object({
  accountId: z.string().uuid(),
  userId: z.string().uuid(),
});

export type RemoveMemberData = z.infer<typeof removeMemberSchema>;
