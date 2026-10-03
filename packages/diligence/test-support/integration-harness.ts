import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';

const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ANON_KEY;
process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE_KEY;

export interface IntegrationAccount {
  admin: SupabaseClient;
  user: SupabaseClient;
  userId: string;
  accountId: string;
  cleanup: () => Promise<void>;
}

export async function provisionAccount(): Promise<IntegrationAccount> {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const unique = crypto.randomUUID().slice(0, 8);
  const email = `int-dl-${unique}@odb.test`;
  const password = `Pw-${unique}-Aa1!`;

  const { data: created, error: createError } =
    await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (createError) {
    throw createError;
  }

  const userId = created.user.id;

  const { data: account, error: accountError } = await admin
    .from('accounts')
    .select('id')
    .eq('primary_owner_user_id', userId)
    .eq('is_personal_account', true)
    .single();
  if (accountError) {
    throw accountError;
  }

  const user = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: signInError } = await user.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError) {
    throw signInError;
  }

  return {
    admin,
    user,
    userId,
    accountId: account.id as string,
    cleanup: async () => {
      await admin.auth.admin.deleteUser(userId);
    },
  };
}

export async function appendDealEvent(
  admin: SupabaseClient,
  params: {
    dealId: string;
    aggregateType: string;
    aggregateId: string;
    eventType: string;
    payload?: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await admin.rpc('append_deal_event', {
    p_deal_id: params.dealId,
    p_aggregate_type: params.aggregateType,
    p_aggregate_id: params.aggregateId,
    p_event_type: params.eventType,
    p_payload: params.payload ?? {},
    p_actor_kind: 'service',
    p_actor_via: 'integration-test',
  });
  if (error) {
    throw error;
  }
}

export async function seedDeal(
  admin: SupabaseClient,
  accountId: string,
  ownerUserId: string,
  payload: Record<string, unknown>,
): Promise<string> {
  const dealId = crypto.randomUUID();
  await appendDealEvent(admin, {
    dealId,
    aggregateType: 'deal',
    aggregateId: dealId,
    eventType: 'deal.created',
    payload: { account_id: accountId, owner_user_id: ownerUserId, ...payload },
  });
  return dealId;
}

export async function seedSignedLoi(
  admin: SupabaseClient,
  accountId: string,
  dealId: string,
): Promise<void> {
  const contractId = crypto.randomUUID();
  await appendDealEvent(admin, {
    dealId,
    aggregateType: 'contract',
    aggregateId: contractId,
    eventType: 'contract.created',
    payload: { type: 'loi', status: 'draft' },
  });
  const { error } = await admin.from('contract_version').insert({
    contract_id: contractId,
    account_id: accountId,
    version: 1,
    source: 'upload',
    party: 'buyer',
    is_signed: true,
  });
  if (error) {
    throw error;
  }
}
