import {
  createNovuClient,
  triggerNotification,
} from '@odb/notifications/server';
import type { Enums } from '@odb/supabase';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

import { dealManagerIds } from '../dealManagers';

export async function noticeDealManagers(input: {
  accountId: string;
  message: string;
  path: string;
  type: Enums<'notification_type'>;
  event: string;
  dedupeKey: (userId: string) => string;
}): Promise<void> {
  const admin = getSupabaseServerAdminClient();
  const recipients = await dealManagerIds(input.accountId);

  await admin
    .from('notifications')
    .upsert(
      recipients.map((userId) => ({
        account_id: input.accountId,
        recipient_user_id: userId,
        type: input.type,
        body: input.message,
        link: input.path,
        dedupe_key: input.dedupeKey(userId),
      })),
      { onConflict: 'dedupe_key', ignoreDuplicates: true },
    )
    .throwOnError();

  if (!process.env.NOVU_API_KEY || !process.env.NOVU_API_URL) {
    return;
  }
  const { data: personalAccounts } = await admin
    .from('accounts')
    .select('primary_owner_user_id, email')
    .eq('is_personal_account', true)
    .in('primary_owner_user_id', recipients)
    .throwOnError();
  const novu = createNovuClient();
  for (const { primary_owner_user_id: userId, email } of personalAccounts) {
    await triggerNotification(
      { novu, client: admin },
      {
        eventType: input.event,
        recipientUserId: userId,
        email: email ?? undefined,
        payload: { message: input.message, path: input.path },
        transactionId: input.dedupeKey(userId),
      },
    );
  }
}
