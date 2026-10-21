import { z } from 'zod';

export const setQuietDaysInput = z.object({
  accountId: z.uuid(),
  quietDays: z.number().int().positive(),
});
