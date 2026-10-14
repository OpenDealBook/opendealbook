import 'server-only';

import { loadBuyerProfile } from '@odb/buyer-profile/server';
import { buyerProfilePhotoSignedUrl } from '@odb/buyer-profile/storage';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

import { loadClosedRoomContactEmail } from '../members/closed-room-contact';
import type { RoomContact } from './contact-card';
import { contactFacts } from './header-facts';

export async function loadRoomContact(roomId: string): Promise<RoomContact> {
  // Service role: a lender cannot read the room row or the buyer profile.
  // The caller has already passed the room gate as a member.
  const admin = getSupabaseServerAdminClient();
  const { data: room } = await admin
    .from('lender_room')
    .select('account_id')
    .eq('id', roomId)
    .single()
    .throwOnError();

  const facts = contactFacts(await loadBuyerProfile(admin, room.account_id));

  if (!facts) {
    return {
      name: null,
      photoUrl: null,
      email: await loadClosedRoomContactEmail(admin, roomId),
      phone: null,
    };
  }

  const { photoPath, ...contact } = facts;

  return {
    ...contact,
    photoUrl: photoPath
      ? await buyerProfilePhotoSignedUrl(admin, photoPath)
      : null,
  };
}
