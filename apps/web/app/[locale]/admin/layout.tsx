import type { ReactNode } from 'react';

import { notFound, redirect } from 'next/navigation';

import { adminGuard } from '@tuckin/admin';
import { getSupabaseServerClient } from '@tuckin/supabase/server';

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = getSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/sign-in');
  }

  const guard = await adminGuard(supabase);

  if (guard.status === 'forbidden') {
    notFound();
  }

  if (guard.status === 'needs-mfa') {
    redirect('/mfa-setup');
  }

  return <>{children}</>;
}
