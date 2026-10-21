import { DealCloseSection } from '../../../../_components/deal-close-section';
import { loadTeamWorkspace } from '../../../layout';

export default async function TeamDealCustomerTransitionPage({
  params,
}: {
  params: Promise<{ locale: string; account: string; id: string }>;
}) {
  const { account, id } = await params;
  const { team } = await loadTeamWorkspace(account);

  return (
    <main className={'flex min-w-0 flex-col gap-6 p-4 md:p-8'}>
      <DealCloseSection accountId={team.id} dealId={id} />
    </main>
  );
}
