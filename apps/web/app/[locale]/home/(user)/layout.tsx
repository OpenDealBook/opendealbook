import type { ReactNode } from 'react';

import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getTranslations } from 'next-intl/server';

import { hasLenderRooms } from '@odb/lender-rooms/members/room-gate.ts';
import { NotificationsPopover } from '@odb/notifications/components';
import { getSupabaseServerClient } from '@odb/supabase/server';
import { Logo } from '@odb/ui/logo';

import { AccountDropdown } from './_components/account-dropdown';

export default async function UserWorkspaceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  const t = await getTranslations({ locale });

  const client = getSupabaseServerClient();

  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    redirect('/auth/sign-in');
  }

  const showLenderRooms = await hasLenderRooms(client);

  return (
    <div className={'flex min-h-screen'}>
      <aside
        className={'bg-muted/40 hidden w-64 flex-col border-r p-4 md:flex'}
      >
        <Link href={'/home'} className={'flex items-center gap-2 px-2 py-4'}>
          <Logo size={24} wordmark />
        </Link>

        <nav className={'mt-2 flex flex-col gap-1'}>
          <Link
            href={'/home/settings'}
            className={
              'hover:bg-muted rounded-md px-2 py-2 text-sm font-medium'
            }
          >
            {t('account.settings')}
          </Link>

          {showLenderRooms && (
            <Link
              href={'/lender'}
              className={
                'hover:bg-muted rounded-md px-2 py-2 text-sm font-medium'
              }
            >
              {t('common.lenderRooms')}
            </Link>
          )}
        </nav>
      </aside>

      <div className={'flex flex-1 flex-col'}>
        <header
          className={'flex items-center justify-end gap-2 border-b px-6 py-3'}
        >
          <NotificationsPopover accountId={user.id} />
          <AccountDropdown email={user.email ?? ''} />
        </header>

        <div className={'flex-1'}>{children}</div>
      </div>
    </div>
  );
}
