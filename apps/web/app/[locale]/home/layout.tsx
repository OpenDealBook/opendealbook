import type { ReactNode } from 'react';

import { redirect } from 'next/navigation';

import { getSupabaseServerClient } from '@odb/supabase/server';

export const dynamic = 'force-dynamic';

export default async function HomeLayout({
  children,
}: {
  children: ReactNode;
}) {
  const client = getSupabaseServerClient();

  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    redirect('/auth/sign-in');
  }

  const { data: account, error } = await client
    .from('accounts')
    .select('onboarded')
    .eq('primary_owner_user_id', user.id)
    .eq('is_personal_account', true)
    .single();

  if (error) {
    throw error;
  }

  if (!account.onboarded) {
    redirect('/onboarding');
  }

  return <>{children}</>;
}
