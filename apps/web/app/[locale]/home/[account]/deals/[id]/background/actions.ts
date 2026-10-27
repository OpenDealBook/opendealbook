'use server';

import { z } from 'zod';

import { refusableAction } from '@odb/next/actions/refusable-action';
import { getSupabaseServerClient } from '@odb/supabase/server';
import { startBackgroundSearchRun } from '@odb/workflows/builder/client';

import { refusingManualRun } from '../../../workflows/refusing-manual-run';

export const runBackgroundSearch = refusableAction(
  async ({ dealId, requestId }) =>
    refusingManualRun(() =>
      startBackgroundSearchRun({
        client: getSupabaseServerClient(),
        dealId,
        requestId,
      }),
    ),
  z.object({ dealId: z.uuid(), requestId: z.uuid() }),
);
