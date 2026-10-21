import { z } from 'zod';

export const ListAccountsSchema = z.object({
  search: z.string().optional(),
  page: z.number().default(0),
  perPage: z.number().default(20),
});

export const AccountIdSchema = z.object({
  accountId: z.uuid(),
});

export const UserIdSchema = z.object({
  userId: z.uuid(),
});

export const SellerSendLimitSchema = z.object({
  accountId: z.uuid(),
  dailyLimit: z.number().int().min(0).nullable(),
});

export type ListAccountsInput = z.infer<typeof ListAccountsSchema>;
export type AccountIdInput = z.infer<typeof AccountIdSchema>;
export type UserIdInput = z.infer<typeof UserIdSchema>;
export type SellerSendLimitInput = z.infer<typeof SellerSendLimitSchema>;
