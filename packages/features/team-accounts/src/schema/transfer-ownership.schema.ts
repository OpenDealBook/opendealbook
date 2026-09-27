import { z } from 'zod';

export const transferOwnershipSchema = z.object({
  accountId: z.string().uuid(),
  userId: z.string().uuid(),
});

export type TransferOwnershipData = z.infer<typeof transferOwnershipSchema>;
