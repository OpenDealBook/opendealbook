import { z } from 'zod';

import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

import { sendLetter as mailLetter } from '../../letters/sendLetter';
import { NODE_CONFIG_SCHEMAS } from '../graph';
import { defineStep } from '../step';
import { teamRow } from '../teamRow';

export const sendLetter = defineStep({
  type: 'send_letter',
  runOnce: false,
  configSchema: NODE_CONFIG_SCHEMAS.send_letter,
  inputSchema: z.object({}),
  outputSchema: z.object({ letterId: z.string(), status: z.string() }),
  async run({ context, config }) {
    const template = await teamRow(config.templateId, 'That letter template is not on this team', (id) =>
      getSupabaseServerAdminClient()
        .from('letter_template')
        .select('body')
        .eq('id', id)
        .eq('account_id', context.accountId)
        .maybeSingle()
        .throwOnError(),
    );

    return mailLetter({
      accountId: context.accountId,
      firmId: config.firmId,
      body: template.body,
      idempotencyKey: context.idempotencyKey,
    });
  },
});
