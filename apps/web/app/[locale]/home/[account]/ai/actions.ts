'use server';

import { z } from 'zod';

import { enhanceAction } from '@odb/next/actions';

import { aiThreadCursor, listAiThreads } from '../../_lib/deal-ask-data';

export const loadMoreAiThreads = enhanceAction(
  ({ teamId, after }) => listAiThreads(teamId, after),
  {
    auth: true,
    schema: z.object({
      teamId: z.uuid(),
      after: aiThreadCursor,
    }),
  },
);
