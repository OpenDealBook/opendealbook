import { PageHeader } from '@odb/ui/page-header';

import { DealsList } from '../../../_components/deals-list';
import { loadTeamWorkspace } from '../../layout';

interface TeamDealsPageProps {
  params: Promise<{ locale: string; account: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function TeamDealsPage({
  params,
  searchParams,
}: TeamDealsPageProps) {
  const { account } = await params;
  const { team, isOwner, permissions } = await loadTeamWorkspace(account);
  const resolvedSearchParams = await searchParams;

  return (
    <main className={'flex flex-col gap-6 p-4 md:p-8'}>
      <PageHeader title={'Deals'} />
      <DealsList
        accountId={team.id}
        isOwner={isOwner}
        canCreate={permissions.includes('deals.create')}
        searchParams={resolvedSearchParams}
        detailBasePath={`/home/${account}/deals`}
      />
    </main>
  );
}
