import { DEFAULT_MAX_TOUCHES } from '@odb/outreach-app/schema';
import { Refusal } from '@odb/next/refusal';
import type { TablesUpdate } from '@odb/supabase';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { DEFAULT_DAILY_CAP } from './outreach-defaults';

const INSUFFICIENT_PRIVILEGE = '42501';

export async function saveOutreachSetting(
  accountId: string,
  patch: TablesUpdate<'outreach_setting'>,
  refusal: string,
): Promise<void> {
  const client = getSupabaseServerClient();

  const { data: updated } = await client
    .from('outreach_setting')
    .update(patch)
    .eq('account_id', accountId)
    .select('account_id')
    .throwOnError();

  if (updated.length === 0) {
    const { error } = await client.from('outreach_setting').insert({
      account_id: accountId,
      daily_cap: DEFAULT_DAILY_CAP,
      max_touches: DEFAULT_MAX_TOUCHES,
      ...patch,
    });

    if (error?.code === INSUFFICIENT_PRIVILEGE) {
      throw new Refusal(refusal);
    }
    if (error) {
      throw error;
    }
  }
}
