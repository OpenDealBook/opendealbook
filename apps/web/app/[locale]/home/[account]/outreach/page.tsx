import { PageHeader } from '@odb/ui/page-header';

import { OutreachArea } from '../../_components/outreach/outreach-area';
import { loadTeamWorkspace } from '../layout';

interface TeamOutreachPageProps {
  params: Promise<{ locale: string; account: string }>;
}

export default async function TeamOutreachPage({
  params,
}: TeamOutreachPageProps) {
  const { account } = await params;
  const { team, permissions } = await loadTeamWorkspace(account);

  return (
    <main className={'flex flex-col gap-6 p-8'}>
      <PageHeader title={'Outreach'} />
      <OutreachArea
        accountId={team.id}
        canManageDeals={permissions.includes('deals.manage')}
      />
    </main>
  );
}
