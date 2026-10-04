'use server';

import { enhanceAction } from '@odb/next/actions';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@odb/supabase';
import {
  getSupabaseServerAdminClient,
  getSupabaseServerClient,
} from '@odb/supabase/server';

import { assertSuperAdmin } from './utils/super-admin';

type Client = SupabaseClient<Database>;

async function countRows<T extends keyof Database['public']['Tables']>(
  client: Client,
  table: T,
): Promise<number> {
  const { count } = await client
    .from(table)
    .select('*', { count: 'exact', head: true });

  return count ?? 0;
}

export const getAdminOverviewAction = enhanceAction(async (_input: void) => {
  await assertSuperAdmin(getSupabaseServerClient());

  const client = getSupabaseServerAdminClient();

  const [
    accounts,
    deals,
    offers,
    comps,
    subscriptions,
    aiCalls,
    llmEndpoints,
    optInTotal,
  ] = await Promise.all([
    countRows(client, 'accounts'),
    countRows(client, 'deal'),
    countRows(client, 'offer'),
    countRows(client, 'comp'),
    countRows(client, 'subscriptions'),
    countRows(client, 'ai_call_log'),
    countRows(client, 'llm_endpoint'),
    countRows(client, 'comp_pool_optin'),
  ]);

  const { count: optInActive } = await client
    .from('comp_pool_optin')
    .select('*', { count: 'exact', head: true })
    .eq('opted_in', true);

  const { data: config } = await client
    .from('config')
    .select(
      'enable_team_accounts, enable_account_billing, enable_team_account_billing, billing_provider, comp_pool_min_bucket',
    )
    .single();

  return {
    metrics: { accounts, deals, offers, comps, subscriptions, aiCalls },
    ai: { calls: aiCalls, endpoints: llmEndpoints },
    optIn: { active: optInActive ?? 0, total: optInTotal },
    config: config!,
  };
}, {});

export const getAdminCompsPoolAction = enhanceAction(async (_input: void) => {
  await assertSuperAdmin(getSupabaseServerClient());

  const client = getSupabaseServerAdminClient();

  const [{ data: compBuckets }, { data: activityBuckets }] = await Promise.all([
    client
      .from('comp_pool_public')
      .select(
        'region, naics3, industry_short, close_quarter, n, median_sde_multiple, median_sale_price',
      )
      .order('n', { ascending: false }),
    client
      .from('activity_pool_public')
      .select(
        'region, naics3, industry_short, created_quarter, outcome, n, median_asking_price, median_loi_price',
      )
      .order('n', { ascending: false }),
  ]);

  const { count: externalCount } = await client
    .from('comp_external')
    .select('*', { count: 'exact', head: true });
  const externalComps = externalCount ?? 0;

  const { count: optInActive } = await client
    .from('comp_pool_optin')
    .select('*', { count: 'exact', head: true })
    .eq('opted_in', true);

  const { data: config } = await client
    .from('config')
    .select('comp_pool_min_bucket')
    .single();

  return {
    minBucket: config!.comp_pool_min_bucket,
    compBuckets: compBuckets ?? [],
    activityBuckets: activityBuckets ?? [],
    externalComps,
    optInActive: optInActive ?? 0,
  };
}, {});
