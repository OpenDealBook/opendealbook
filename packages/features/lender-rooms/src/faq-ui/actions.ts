'use server';

import { z } from 'zod';

import { getSupabaseServerClient } from '@odb/supabase/server';

import { refusableAction } from '../actions/refusable-action';
import { fetchRoomFaq } from '../faq/queries';

export const searchRoomFaq = refusableAction(
  ({ roomId, query }) => fetchRoomFaq(getSupabaseServerClient(), roomId, query),
  { schema: z.object({ roomId: z.uuid(), query: z.string().min(1) }) },
);
