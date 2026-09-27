import { z } from 'zod';

export const updateMemberRoleSchema = z.object({
  accountId: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.string().trim().min(1).max(100),
});

export type UpdateMemberRoleData = z.infer<typeof updateMemberRoleSchema>;
