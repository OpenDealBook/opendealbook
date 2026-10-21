import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

import { SELLER_ROOM_ACTIVITY_WORKFLOW_ID } from '@odb/notifications/relay';
import {
  createNovuClient,
  triggerNotification,
} from '@odb/notifications/server';
import { getLogger } from '@odb/shared/logger';
import type { Database } from '@odb/supabase';

import { dealManagerIds } from './deal-manager-ids';

type Admin = SupabaseClient<Database>;

export async function notifyDealManagers(
  admin: Admin,
  accountId: string,
  dealId: string,
  body: string,
  link?: string,
): Promise<void> {
  const managers = await dealManagerIds(admin, accountId);

  await admin
    .from('notifications')
    .insert(
      managers.map((managerId) => ({
        account_id: accountId,
        recipient_user_id: managerId,
        deal_id: dealId,
        type: 'info' as const,
        body,
        link,
      })),
    )
    .throwOnError();
}

// Queued for each deal manager's daily seller-activity email, like the lender
// digest: a Novu outage must not fail the seller's upload or answer.
export async function queueSellerActivity(
  admin: Admin,
  accountId: string,
  activity: { roomId: string; line: string },
): Promise<void> {
  if (!process.env.NOVU_API_KEY || !process.env.NOVU_API_URL) {
    return;
  }

  try {
    const managers = await dealManagerIds(admin, accountId);
    const { data: personalAccounts } = await admin
      .from('accounts')
      .select('primary_owner_user_id, email')
      .eq('is_personal_account', true)
      .in('primary_owner_user_id', managers)
      .throwOnError();

    const emailOf = new Map(
      personalAccounts.map((account) => [
        account.primary_owner_user_id,
        account.email,
      ]),
    );
    const novu = createNovuClient();

    await Promise.all(
      managers.map((recipientUserId) =>
        triggerNotification(
          { novu, client: admin },
          {
            eventType: SELLER_ROOM_ACTIVITY_WORKFLOW_ID,
            recipientUserId,
            payload: activity,
            email: emailOf.get(recipientUserId) ?? undefined,
          },
        ),
      ),
    );
  } catch (error) {
    getLogger().error(
      { err: error, roomId: activity.roomId },
      'Seller activity digest event failed',
    );
  }
}
