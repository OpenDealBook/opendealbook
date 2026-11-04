import { DataRoomSection } from '../../../../_components/data-room-section';
import { DealContractsSection } from '../../../../_components/deal-contracts-section';
import { loadTeamWorkspace } from '../../../layout';

export default async function TeamDealDocumentsPage({
  params,
}: {
  params: Promise<{ locale: string; account: string; id: string }>;
}) {
  const { account, id } = await params;
  const { team } = await loadTeamWorkspace(account);

  return (
    <main className={'flex min-w-0 flex-col gap-10 p-4 md:p-8'}>
      <DataRoomSection dealId={id} accountId={team.id} />
      <DealContractsSection
        dealId={id}
        filesPath={`/home/${account}/deals/${id}/contracts/files`}
      />
    </main>
  );
}
