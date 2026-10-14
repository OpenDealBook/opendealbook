import type { ReactNode } from 'react';

import { notFound } from 'next/navigation';

import { LenderTeamSubnav } from '../../_components/lender-team-subnav';
import { loadTeamWorkspace } from '../layout';

export default async function TeamLendersLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ account: string }>;
}) {
  const { account } = await params;
  const { permissions } = await loadTeamWorkspace(account);

  if (!permissions.includes('deals.manage')) {
    notFound();
  }

  return (
    <main className={'flex flex-col gap-6 p-8'}>
      <h1 className={'font-serif text-2xl font-medium'}>Lenders</h1>
      <LenderTeamSubnav basePath={`/home/${account}/lenders`} />
      {children}
    </main>
  );
}
