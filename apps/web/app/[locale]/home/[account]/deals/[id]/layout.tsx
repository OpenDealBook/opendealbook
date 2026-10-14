import type { ReactNode } from 'react';

import { DealSubnav } from '../../../_components/deal-subnav';
import { managesDeal } from '../../../_components/lender-manages-deal';
import { loadTeamWorkspace } from '../../layout';

export default async function TeamDealLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ account: string; id: string }>;
}) {
  const { account, id } = await params;
  const { team } = await loadTeamWorkspace(account);

  return (
    <div className={'flex flex-col'}>
      <div className={'px-8 pt-8'}>
        <DealSubnav showLenders={await managesDeal(id, team.id)} />
      </div>
      {children}
    </div>
  );
}
