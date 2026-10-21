import { OpenDataRoomWindow } from '../../../../_components/data-room-document-link';
import { DealDocuments } from '../../../../_components/deal-detail';
import { loadTeamWorkspace } from '../../../layout';

export default async function TeamDealDocumentsPage({
  params,
}: {
  params: Promise<{ locale: string; account: string; id: string }>;
}) {
  const { account, id } = await params;
  await loadTeamWorkspace(account);

  return (
    <main className={'flex min-w-0 flex-col gap-6 p-4 md:p-8'}>
      <div className={'flex justify-end'}>
        <OpenDataRoomWindow />
      </div>
      <DealDocuments
        dealId={id}
        contractFilesPath={`/home/${account}/deals/${id}/contracts/files`}
      />
    </main>
  );
}
