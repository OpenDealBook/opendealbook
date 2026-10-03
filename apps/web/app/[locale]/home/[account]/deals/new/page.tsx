import { NewDealForm } from '../../../_components/new-deal-form';
import { loadTeamWorkspace } from '../../layout';

interface NewTeamDealPageProps {
  params: Promise<{ locale: string; account: string }>;
}

export default async function NewTeamDealPage({
  params,
}: NewTeamDealPageProps) {
  const { account } = await params;
  const { team } = await loadTeamWorkspace(account);

  return (
    <main className={'flex flex-col gap-6 p-8'}>
      <h1 className={'text-2xl font-semibold'}>New deal</h1>
      <NewDealForm
        accountId={team.id}
        detailBasePath={`/home/${account}/deals`}
      />
    </main>
  );
}
