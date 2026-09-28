import 'server-only';
import { z } from 'zod';

import { enhanceAction } from '@odb/next/actions';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { assertDealsManage } from './permission';
import { canTransition, type FirmStatus } from './state-machine';

const FIRM_STATUSES: readonly [FirmStatus, ...FirmStatus[]] = [
  'imported',
  'enriched',
  'scored',
  'contacted',
  'responded',
  'deal_created',
  'disqualified',
];

const inputSchema = z.object({
  accountId: z.string().uuid(),
  firmId: z.string().uuid(),
  to: z.enum(FIRM_STATUSES),
});

type TransitionFirmInput = z.infer<typeof inputSchema>;

export const transitionFirm = enhanceAction(
  async (input: TransitionFirmInput, user) => {
    const client = getSupabaseServerClient();

    await assertDealsManage(client, input.accountId, user.id);

    const current = await client
      .from('firm')
      .select('status')
      .eq('id', input.firmId)
      .eq('account_id', input.accountId)
      .single();

    if (!canTransition(current.data?.status as FirmStatus, input.to)) {
      throw new Error(
        `Illegal firm transition: ${current.data?.status} -> ${input.to}`,
      );
    }

    const updated = await client
      .from('firm')
      .update({ status: input.to })
      .eq('id', input.firmId)
      .select('id, status')
      .single();

    return updated.data;
  },
  { auth: true, schema: inputSchema },
);
