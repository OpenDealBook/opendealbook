import type { SupabaseClient } from '@supabase/supabase-js';

import { z } from 'zod';

import type { Database } from '@odb/supabase';

const filesSchema = z.array(z.object({ id: z.uuid(), name: z.string() }));

export interface RoomFaqEntry {
  id: string;
  question: string;
  answer: string;
  pinned: boolean;
  firstPublishedAt: string;
  updatedAt: string;
  files: z.infer<typeof filesSchema>;
}

export async function fetchRoomFaq(
  client: SupabaseClient<Database>,
  roomId: string,
  query?: string,
): Promise<RoomFaqEntry[]> {
  const { data } = await client
    .rpc('lender_room_faq', { room_id: roomId, query })
    .throwOnError();

  return data.map((entry) => ({
    id: entry.id,
    question: entry.question,
    answer: entry.answer,
    pinned: entry.pinned,
    firstPublishedAt: entry.first_published_at,
    updatedAt: entry.updated_at,
    files: filesSchema.parse(entry.files),
  }));
}
