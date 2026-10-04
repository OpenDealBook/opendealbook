import { DealCloseSection } from '../../../../_components/deal-close-section';
import { loadTeamWorkspace } from '../../../layout';

interface TeamDealClosePageProps {
  params: Promise<{ locale: string; account: string; id: string }>;
}

export default async function TeamDealClosePage({
  params,
}: TeamDealClosePageProps) {
  const { account, id } = await params;
  const { team } = await loadTeamWorkspace(account);

  return (
    <main className={'flex flex-col gap-6 p-8'}>
      <DealCloseSection accountId={team.id} dealId={id} />
    </main>
  );
}
