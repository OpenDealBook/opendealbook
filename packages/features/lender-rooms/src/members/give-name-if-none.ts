import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@odb/supabase';

// Service role: the deal team names a person they invite, but only a person
// with no name yet; the caller has been verified as able to manage the room.
export async function giveNameIfNone(
  admin: SupabaseClient<Database>,
  userId: string,
  name: string,
) {
  await admin
    .from('lender_person')
    .upsert({ user_id: userId, name }, { ignoreDuplicates: true })
    .throwOnError();

  await admin
    .from('lender_person')
    .update({ name })
    .eq('user_id', userId)
    .is('name', null)
    .throwOnError();
}
