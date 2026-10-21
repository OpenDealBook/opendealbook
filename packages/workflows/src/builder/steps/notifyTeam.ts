import { z } from 'zod';

import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

import { dealManagerIds } from '../../dealManagers';
import { NODE_CONFIG_SCHEMAS } from '../graph';
import { defineStep } from '../step';

export const notifyTeam = defineStep({
  type: 'notify_team',
  runOnce: false,
  configSchema: NODE_CONFIG_SCHEMAS.notify_team,
  inputSchema: z.object({}),
  outputSchema: z.object({ notified: z.number().int() }),
  async run({ context, config }) {
    const recipients = await dealManagerIds(context.accountId);

    await getSupabaseServerAdminClient()
      .from('notifications')
      .upsert(
        recipients.map((recipientUserId) => ({
          account_id: context.accountId,
          recipient_user_id: recipientUserId,
          type: 'info' as const,
          body: config.message,
          dedupe_key: `workflow_step:${context.idempotencyKey}:${recipientUserId}`,
        })),
        { onConflict: 'dedupe_key', ignoreDuplicates: true },
      )
      .throwOnError();

    return { notified: recipients.length };
  },
});
