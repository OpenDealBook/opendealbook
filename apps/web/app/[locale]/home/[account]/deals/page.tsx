import { DealsList } from '../../_components/deals-list';
import { loadTeamWorkspace } from '../layout';

interface TeamDealsPageProps {
  params: Promise<{ locale: string; account: string }>;
}

export default async function TeamDealsPage({ params }: TeamDealsPageProps) {
  const { account } = await params;
  const { team } = await loadTeamWorkspace(account);

  return (
    <main className={'flex flex-col gap-6 p-8'}>
      <h1 className={'text-2xl font-semibold'}>Deals</h1>
      <DealsList accountId={team.id} />
    </main>
  );
}
