import { DealLenderCrm } from '../../../../_components/lender-crm/deal-lender-crm';
import { LenderRoomsPage } from '../../../../_components/lender-pages';
import { loadTeamWorkspace } from '../../../layout';

export default async function TeamDealLendersPage(props: {
  params: Promise<{ account: string; id: string }>;
}) {
  const { account, id } = await props.params;
  const { team } = await loadTeamWorkspace(account);

  return (
    <>
      <LenderRoomsPage
        dealId={id}
        accountId={team.id}
        accountSlug={account}
        basePath={`/home/${account}/deals/${id}/lenders`}
      />
      <DealLenderCrm
        dealId={id}
        accountId={team.id}
        teamPath={`/home/${account}`}
      />
    </>
  );
}
