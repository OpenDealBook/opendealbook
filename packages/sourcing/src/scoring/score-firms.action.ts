import 'server-only';
import { z } from 'zod';

import { enhanceAction } from '@odb/next/actions';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { assertDealsManage } from '../permission';
import { dealBoxCriteriaSchema } from './criteria';
import { scoreFirm } from './score';

const inputSchema = z.object({
  accountId: z.string().uuid(),
});

type ScoreFirmsInput = z.infer<typeof inputSchema>;

const SCORABLE_STATUSES = ['imported', 'enriched', 'scored'] as const;

export const scoreFirms = enhanceAction(
  async (input: ScoreFirmsInput, user) => {
    const client = getSupabaseServerClient();

    await assertDealsManage(client, input.accountId, user.id);

    const dealBox = await client
      .from('deal_box')
      .select('criteria_json')
      .eq('account_id', input.accountId)
      .order('version', { ascending: false })
      .limit(1)
      .single();

    const criteria = dealBoxCriteriaSchema.parse(dealBox.data?.criteria_json);

    const firms = await client
      .from('firm')
      .select(
        'id, industry, state, city, employee_band, owner_age_estimate, service_mix_json',
      )
      .eq('account_id', input.accountId)
      .in('status', SCORABLE_STATUSES);

    const rows = firms.data ?? [];

    for (const firm of rows) {
      await client
        .from('firm')
        .update({ icp_score: scoreFirm(firm, criteria), status: 'scored' })
        .eq('id', firm.id);
    }

    return { scored: rows.length };
  },
  { auth: true, schema: inputSchema },
);
