'use server';

import { z } from 'zod';

import { enhanceAction } from '@odb/next/actions';
import { seedSampleDeals } from '@odb/seed';

const accountSchema = z.object({ accountId: z.string() });

export const reloadSampleData = enhanceAction(
  async (input, user) => {
    await seedSampleDeals({ accountId: input.accountId, userId: user.id });
  },
  { auth: true, schema: accountSchema },
);
