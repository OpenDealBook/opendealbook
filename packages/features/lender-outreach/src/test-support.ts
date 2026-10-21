import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@odb/supabase';

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';

const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const clientOptions = {
  auth: { persistSession: false, autoRefreshToken: false },
};

export const admin = createClient<Database>(
  SUPABASE_URL,
  SERVICE_ROLE_KEY,
  clientOptions,
);

export const suffix = crypto.randomUUID().slice(0, 8);

const userIds: string[] = [];

export async function provisionPerson(name: string) {
  const email = `${name}-${suffix}@odb.test`;
  const password = `Pw-${suffix}-Aa1!`;

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    throw error;
  }

  userIds.push(created.user.id);
  const client: SupabaseClient<Database> = createClient<Database>(
    SUPABASE_URL,
    ANON_KEY,
    clientOptions,
  );
  const signedIn = await client.auth.signInWithPassword({ email, password });

  if (signedIn.error) {
    throw signedIn.error;
  }

  return { client, userId: created.user.id, email };
}

export async function newTeam(ownerId: string, slug: string, name = slug) {
  const { data: team } = await admin
    .rpc('create_team_account', {
      account_name: name,
      user_id: ownerId,
      account_slug: `${slug}-${suffix}`,
    })
    .throwOnError();

  return team.id;
}

export async function addMember(accountId: string, userId: string) {
  await admin
    .from('accounts_memberships')
    .insert({ account_id: accountId, user_id: userId, account_role: 'member' })
    .throwOnError();
}

export async function lockTeam(accountId: string) {
  await admin
    .from('accounts')
    .update({ trial_ends_at: new Date(Date.now() - 86_400_000).toISOString() })
    .eq('id', accountId)
    .throwOnError();
}

export async function deleteProvisionedPeople() {
  for (const userId of userIds) {
    await admin.auth.admin.deleteUser(userId);
  }
}
