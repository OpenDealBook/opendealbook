import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@odb/supabase';

import { DEFAULT_TEMPLATE, type OutreachTemplate } from './default-template';

export async function loadOutreachTemplate(
  client: SupabaseClient<Database>,
  accountId: string,
): Promise<OutreachTemplate> {
  const { data } = await client
    .from('lender_outreach_template')
    .select('subject, body')
    .eq('account_id', accountId)
    .maybeSingle()
    .throwOnError();

  return data ?? DEFAULT_TEMPLATE;
}
