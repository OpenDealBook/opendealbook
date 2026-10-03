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

export interface IntegrationAccount {
  admin: SupabaseClient<Database>;
  user: SupabaseClient<Database>;
  userId: string;
  accountId: string;
  cleanup: () => Promise<void>;
}

export async function provisionAccount(): Promise<IntegrationAccount> {
  const admin = createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const unique = crypto.randomUUID().slice(0, 8);
  const email = `int-${unique}@odb.test`;
  const password = `Pw-${unique}-Aa1!`;

  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

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

  const user = createClient<Database>(SUPABASE_URL, ANON_KEY, {
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
    accountId: account.id,
    cleanup: async () => {
      await admin.auth.admin.deleteUser(userId);
    },
  };
}
