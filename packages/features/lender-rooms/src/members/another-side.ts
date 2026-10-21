import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@odb/supabase';

import { Refusal } from '../actions/refusal';

export async function refuseAnotherSide(
  admin: SupabaseClient<Database>,
  invite: {
    dealId: string;
    email: string;
    side: Database['public']['Enums']['deal_side'];
  },
): Promise<void> {
  const { data: sides } = await admin
    .rpc('deal_side_of_email', { deal_id: invite.dealId, email: invite.email })
    .throwOnError();

  if (sides.some((side) => side !== invite.side)) {
    throw new Refusal('This person is already on another side of this deal.');
  }
}
