import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@odb/supabase';

export const SUPABASE_URL = 'http://127.0.0.1:54321';

export const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

export const SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const clientOptions = {
  auth: { persistSession: false, autoRefreshToken: false },
};

export const admin = createClient<Database>(
  SUPABASE_URL,
  SERVICE_ROLE_KEY,
  clientOptions,
);

export interface Person {
  client: SupabaseClient<Database>;
  userId: string;
  email: string;
}

export const createdUserIds: string[] = [];

export function newEmail(): string {
  return `int-seller-${crypto.randomUUID().slice(0, 8)}@odb.test`;
}

export async function provisionPerson(): Promise<Person> {
  const email = newEmail();
  const password = `Pw-${crypto.randomUUID()}-Aa1!`;

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    throw error;
  }

  createdUserIds.push(created.user.id);

  const client = createClient<Database>(SUPABASE_URL, ANON_KEY, clientOptions);
  const signedIn = await client.auth.signInWithPassword({ email, password });

  if (signedIn.error) {
    throw signedIn.error;
  }

  return { client, userId: created.user.id, email };
}

export async function provisionTeam(
  owner: Person,
  name: string,
): Promise<string> {
  const { data: team } = await admin
    .rpc('create_team_account', {
      account_name: name,
      user_id: owner.userId,
      account_slug: `team-${crypto.randomUUID().slice(0, 8)}`,
    })
    .throwOnError();

  return team.id;
}

export async function newDeal(teamId: string, owner: Person): Promise<string> {
  const dealId = crypto.randomUUID();
  const { data: firm } = await admin
    .from('firm')
    .insert({ account_id: teamId, name: 'Seller room deal' })
    .select('id')
    .single()
    .throwOnError();

  await admin
    .rpc('append_deal_event', {
      p_deal_id: dealId,
      p_aggregate_type: 'deal',
      p_aggregate_id: dealId,
      p_event_type: 'deal.created',
      p_payload: {
        account_id: teamId,
        owner_user_id: owner.userId,
        firm_id: firm.id,
        description: 'Seller room deal',
      },
      p_actor_kind: 'service',
    })
    .throwOnError();

  return dealId;
}

export async function cleanUp(teamIds: string[]): Promise<void> {
  for (const teamId of teamIds) {
    await admin.from('accounts').delete().eq('id', teamId);
  }

  for (const id of createdUserIds.filter(Boolean)) {
    await admin.auth.admin.deleteUser(id);
  }
}

export async function withLockedTeam(
  teamId: string,
  run: () => Promise<void>,
): Promise<void> {
  const { data: config } = await admin
    .from('config')
    .select('enable_team_account_billing')
    .single()
    .throwOnError();

  await admin.rpc('set_team_account_billing', { enabled: true }).throwOnError();
  await admin
    .from('accounts')
    .update({ trial_ends_at: new Date(Date.now() - 86_400_000).toISOString() })
    .eq('id', teamId)
    .throwOnError();

  try {
    await run();
  } finally {
    await admin
      .from('accounts')
      .update({
        trial_ends_at: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .eq('id', teamId)
      .throwOnError();
    await admin
      .rpc('set_team_account_billing', {
        enabled: config.enable_team_account_billing,
      })
      .throwOnError();
  }
}
