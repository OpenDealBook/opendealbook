'use server';

import { z } from 'zod';

import { refusableAction } from '@odb/lender-rooms/actions/refusable-action.ts';
import { requireSpace } from '@odb/lender-rooms/uploads/access.ts';

export const openBuyerCounselUploads = refusableAction(
  async (input): Promise<string> =>
    (await requireSpace({ counselDealId: input.dealId })).containerFolderId,
  { schema: z.object({ dealId: z.uuid() }) },
);
