import type { SupabaseClient } from '@supabase/supabase-js';

import { SELLER_ROOM_SHARED_WORKFLOW_ID } from '@odb/notifications/relay';
import {
  createNovuClient,
  triggerNotification,
} from '@odb/notifications/server';
import { getLogger } from '@odb/shared/logger';
import type { Database } from '@odb/supabase';

export type SharedWithSellers =
  | { kind: 'folder'; roomId: string; folderId: string }
  | { kind: 'meeting'; roomId: string; meetingId: string };

export async function queueForSellerDigest(
  admin: SupabaseClient<Database>,
  shared: SharedWithSellers,
): Promise<void> {
  if (!process.env.NOVU_API_KEY || !process.env.NOVU_API_URL) {
    return;
  }

  const { data: firstTime } = await admin
    .from('seller_room_announcement')
    .upsert(
      {
        room_id: shared.roomId,
        kind: shared.kind,
        item_id: shared.kind === 'folder' ? shared.folderId : shared.meetingId,
      },
      { onConflict: 'room_id,kind,item_id', ignoreDuplicates: true },
    )
    .select('item_id')
    .throwOnError();

  if (firstTime.length === 0) {
    return;
  }

  const { data: members } = await admin
    .from('seller_room_member')
    .select('user_id, email')
    .eq('room_id', shared.roomId)
    .throwOnError();
  const { data: accounts } = await admin
    .from('accounts')
    .select('id, timezone')
    .in(
      'id',
      members.map((member) => member.user_id),
    )
    .throwOnError();
  const timezones = new Map(
    accounts.map((account) => [account.id, account.timezone ?? undefined]),
  );
  const novu = createNovuClient();

  // A Novu outage must not fail the team's change, as for lender notices.
  try {
    await Promise.all(
      members.map((member) =>
        triggerNotification(
          { novu, client: admin },
          {
            eventType: SELLER_ROOM_SHARED_WORKFLOW_ID,
            recipientUserId: member.user_id,
            email: member.email,
            payload: { ...shared, timezone: timezones.get(member.user_id) },
          },
        ),
      ),
    );
  } catch (error) {
    getLogger().error(
      { err: error, roomId: shared.roomId },
      'Seller digest event failed',
    );
  }
}
