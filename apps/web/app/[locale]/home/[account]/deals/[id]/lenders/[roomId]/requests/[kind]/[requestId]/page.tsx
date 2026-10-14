import { LenderRequestPage } from '../../../../../../../../_components/lender-pages';
import { loadTeamWorkspace } from '../../../../../../../layout';

export default async function TeamDealLenderRequestPage(props: {
  params: Promise<{
    account: string;
    id: string;
    roomId: string;
    kind: string;
    requestId: string;
  }>;
}) {
  const { account, id, roomId, kind, requestId } = await props.params;
  const { team } = await loadTeamWorkspace(account);

  return (
    <LenderRequestPage
      dealId={id}
      accountId={team.id}
      roomId={roomId}
      kindSegment={kind}
      requestId={requestId}
      basePath={`/home/${account}/deals/${id}/lenders`}
    />
  );
}
