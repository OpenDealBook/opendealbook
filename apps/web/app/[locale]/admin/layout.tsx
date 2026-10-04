import type { ReactNode } from 'react';

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { adminGuard } from '@odb/admin';
import { getSupabaseServerClient } from '@odb/supabase/server';

export const dynamic = 'force-dynamic';

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

  return (
    <div className="space-y-6 p-6">
      <nav className="flex gap-4 text-sm font-medium">
        <Link href="/admin">Accounts</Link>
        <Link href="/admin/overview">Overview</Link>
        <Link href="/admin/comps">Comps pool</Link>
      </nav>
      {children}
    </div>
  );
}
