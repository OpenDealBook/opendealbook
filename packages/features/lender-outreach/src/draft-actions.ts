'use server';

import { z } from 'zod';

import { refusableAction } from '@odb/lender-rooms/actions/refusable-action.ts';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { loadDrafts } from './load-drafts';

export const draftLenderOutreach = refusableAction(
  async (input, user) =>
    loadDrafts(getSupabaseServerClient(), input.dealId, user.id),
  { auth: true, schema: z.object({ dealId: z.uuid() }) },
);
