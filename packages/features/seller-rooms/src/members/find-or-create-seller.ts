import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@odb/supabase';

export async function findSeller(
  admin: SupabaseClient<Database>,
  email: string,
): Promise<string | undefined> {
  const { data: account } = await admin
    .from('accounts')
    .select('primary_owner_user_id')
    .eq('email', email)
    .eq('is_personal_account', true)
    .maybeSingle()
    .throwOnError();

  return account?.primary_owner_user_id;
}

export async function findOrCreateSeller(
  admin: SupabaseClient<Database>,
  email: string,
): Promise<string> {
  const existing = await findSeller(admin, email);

  if (existing) {
    return existing;
  }

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });

  if (!error) {
    return created.user.id;
  }

  const createdMeanwhile = await findSeller(admin, email);

  if (!createdMeanwhile) {
    throw error;
  }

  return createdMeanwhile;
}
