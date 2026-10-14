import type { SupabaseClient } from '@supabase/supabase-js';

import { z } from 'zod';

import { loadBuyerProfile } from '@odb/buyer-profile/server';
import type { Database } from '@odb/supabase';

const profileWithContactEmail = z.object({
  contact_json: z.object({ email: z.email() }),
});

export async function loadClosedRoomContactEmail(
  admin: SupabaseClient<Database>,
  roomId: string,
): Promise<string> {
  // Service role: a lender cannot read the room row, the buyer profile, or the
  // owner. The caller has already passed the room gate as a member.
  const { data: room } = await admin
    .from('lender_room')
    .select('account_id, accounts(primary_owner_user_id)')
    .eq('id', roomId)
    .single()
    .throwOnError();

  const profile = profileWithContactEmail.safeParse(
    await loadBuyerProfile(admin, room.account_id),
  );

  if (profile.success) {
    return profile.data.contact_json.email;
  }

  const { data: owner, error } = await admin.auth.admin.getUserById(
    room.accounts.primary_owner_user_id,
  );

  if (error) {
    throw error;
  }

  if (!owner.user.email) {
    throw new Error(`Lender room ${roomId} has no contact email`);
  }

  return owner.user.email;
}
