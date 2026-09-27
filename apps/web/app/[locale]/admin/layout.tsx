import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { assertSuperAdmin } from '@tuckin/admin';
import { getSupabaseServerClient } from '@tuckin/supabase/server';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = getSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/sign-in');
  }

  try {
    assertSuperAdmin(user);
  } catch {
    redirect('/home');
  }

  return <>{children}</>;
}
