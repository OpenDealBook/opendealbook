'use server';

import { z } from 'zod';

import { enhanceAction } from '@odb/next/actions';
import { getSupabaseServerClient } from '@odb/supabase/server';

const DismissNotificationSchema = z.object({
  id: z.number(),
});

export const dismissNotification = enhanceAction(
  async ({ id }: z.output<typeof DismissNotificationSchema>) => {
    const client = getSupabaseServerClient();

    const { error } = await client
      .from('notifications')
      .update({ dismissed: true })
      .eq('id', id);

    if (error) {
      throw error;
    }
  },
  { auth: true, schema: DismissNotificationSchema },
);
