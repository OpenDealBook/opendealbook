'use server';

import { z } from 'zod';

import { enhanceAction } from '@odb/next/actions';
import { getSupabaseServerClient } from '@odb/supabase/server';

const MarkAllNotificationsReadSchema = z.object({
  accountId: z.string().uuid(),
});

export const markAllNotificationsRead = enhanceAction(
  async ({ accountId }: z.output<typeof MarkAllNotificationsReadSchema>) => {
    await getSupabaseServerClient()
      .rpc('mark_all_notifications_read', { target_account_id: accountId })
      .throwOnError();
  },
  { auth: true, schema: MarkAllNotificationsReadSchema },
);
