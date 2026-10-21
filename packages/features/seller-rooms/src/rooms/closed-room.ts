import type { SupabaseClient } from '@supabase/supabase-js';

import { z } from 'zod';

import type { Database } from '@odb/supabase';

const profileWithContactEmail = z.object({
  contact_json: z.object({ email: z.email() }),
});

export async function loadClosedSellerRoom(
  admin: SupabaseClient<Database>,
  roomId: string,
): Promise<{ contactEmail: string; isDealArchived: boolean }> {
  const { data: room } = await admin
    .from('seller_room')
    .select('account_id, accounts(primary_owner_user_id), deal(archived_at)')
    .eq('id', roomId)
    .single()
    .throwOnError();

  const { data: profile } = await admin
    .rpc('current_buyer_profile', { account_id: room.account_id })
    .maybeSingle()
    .throwOnError();
  const fromProfile = profileWithContactEmail.safeParse(profile);
  const isDealArchived = room.deal.archived_at !== null;

  if (fromProfile.success) {
    return {
      contactEmail: fromProfile.data.contact_json.email,
      isDealArchived,
    };
  }

  const { data: owner, error } = await admin.auth.admin.getUserById(
    room.accounts.primary_owner_user_id,
  );

  if (error) {
    throw error;
  }

  if (!owner.user.email) {
    throw new Error(`Seller room ${roomId} has no contact email`);
  }

  return { contactEmail: owner.user.email, isDealArchived };
}
