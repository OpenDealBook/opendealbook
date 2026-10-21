'use server';

import { appendDealEvent } from '@odb/events';
import { TEAM_READ_ONLY } from '@odb/next';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { Refusal, refusableAction } from '../refusal';
import {
  dealTermsSoughtSchema,
  setCloseDeadlineSchema,
} from './lender-terms.schema';

async function openTeamOfDealManager(dealId: string): Promise<string> {
  const client = getSupabaseServerClient();

  const { data: isManager } = await client
    .rpc('has_deal_permission', {
      deal_id: dealId,
      permission: 'deals.manage',
    })
    .throwOnError();

  if (!isManager) {
    throw new Refusal('Only the deal team can do that');
  }

  const { data: deal } = await client
    .from('deal')
    .select('account_id')
    .eq('id', dealId)
    .single()
    .throwOnError();

  const { data: locked } = await client
    .rpc('is_account_locked', { target_account_id: deal.account_id })
    .throwOnError();

  if (locked) {
    throw new Refusal(TEAM_READ_ONLY);
  }

  return deal.account_id;
}

export const setCloseDeadline = refusableAction(async (data) => {
  await openTeamOfDealManager(data.deal_id);

  await appendDealEvent(getSupabaseServerClient(), {
    dealId: data.deal_id,
    aggregateType: 'deal',
    aggregateId: data.deal_id,
    eventType: 'deal.close_deadline_set',
    payload: {
      must_close_by: data.must_close_by,
      must_close_reason: data.must_close_reason,
    },
  });
}, setCloseDeadlineSchema);

export const saveDealTermsSought = refusableAction(async (data) => {
  const accountId = await openTeamOfDealManager(data.deal_id);

  await getSupabaseServerClient()
    .from('deal_terms_sought')
    .upsert({ ...data, account_id: accountId }, { onConflict: 'deal_id' })
    .throwOnError();
}, dealTermsSoughtSchema);
