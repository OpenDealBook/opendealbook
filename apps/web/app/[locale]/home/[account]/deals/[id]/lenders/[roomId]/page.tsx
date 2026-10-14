import { LenderRoomPage } from '../../../../../_components/lender-pages';
import { loadTeamWorkspace } from '../../../../layout';

export default async function TeamDealLenderRoomPage(props: {
  params: Promise<{ account: string; id: string; roomId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ account, id, roomId }, { tab }] = await Promise.all([
    props.params,
    props.searchParams,
  ]);
  const { team } = await loadTeamWorkspace(account);

  return (
    <LenderRoomPage
      dealId={id}
      accountId={team.id}
      roomId={roomId}
      basePath={`/home/${account}/deals/${id}/lenders`}
      tab={tab}
    />
  );
}
