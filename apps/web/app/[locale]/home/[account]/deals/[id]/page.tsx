import { DealDetail } from '../../../_components/deal-detail';
import { loadTeamWorkspace } from '../../layout';

interface TeamDealDetailPageProps {
  params: Promise<{ locale: string; account: string; id: string }>;
}

export default async function TeamDealDetailPage({
  params,
}: TeamDealDetailPageProps) {
  const { account, id } = await params;
  const { team } = await loadTeamWorkspace(account);

  return (
    <main className={'flex flex-col gap-6 p-8'}>
      <DealDetail accountId={team.id} dealId={id} />
    </main>
  );
}
