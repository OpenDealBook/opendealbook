import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@odb/supabase';

import { Refusal } from '../actions/refusal';

type Client = SupabaseClient<Database>;

export async function listAsks(client: Client, roomId: string) {
  const { data } = await client
    .from('lender_ask')
    .select(
      '*, messages:lender_ask_message(created_at), files:lender_ask_file(created_at)',
    )
    .eq('room_id', roomId)
    .throwOnError();

  return data
    .map(({ messages, files, ...ask }) => ({
      ...ask,
      last_activity_at: new Date(
        Math.max(
          ...[ask, ...messages, ...files].map((row) =>
            Date.parse(row.created_at),
          ),
        ),
      ).toISOString(),
    }))
    .sort((a, b) => b.last_activity_at.localeCompare(a.last_activity_at));
}

export async function getAsk(client: Client, askId: string) {
  const { data } = await client
    .from('lender_ask')
    .select('*, messages:lender_ask_message(*), files:lender_ask_file(*)')
    .eq('id', askId)
    .eq('kind', 'ask')
    .order('created_at', { referencedTable: 'messages' })
    .order('created_at', { referencedTable: 'files' })
    .maybeSingle()
    .throwOnError();

  if (!data) {
    throw new Refusal('That request was not found');
  }

  return data;
}
