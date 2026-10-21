import { LenderFaqPage } from '../../../../../_components/lender-pages';
import { loadTeamWorkspace } from '../../../../layout';

export default async function TeamDealLenderFaqPage(props: {
  params: Promise<{ account: string; id: string }>;
}) {
  const { account, id } = await props.params;
  const { team } = await loadTeamWorkspace(account);

  return (
    <LenderFaqPage
      dealId={id}
      accountId={team.id}
      basePath={`/home/${account}/deals/${id}/lenders`}
    />
  );
}
