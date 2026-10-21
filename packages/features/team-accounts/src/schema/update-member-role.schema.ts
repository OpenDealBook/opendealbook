import { z } from 'zod';

import { invitableRoleSchema } from './invite-members.schema';

export const updateMemberRoleSchema = z.object({
  accountId: z.string().uuid(),
  userId: z.string().uuid(),
  role: invitableRoleSchema,
});

export type UpdateMemberRoleData = z.infer<typeof updateMemberRoleSchema>;
