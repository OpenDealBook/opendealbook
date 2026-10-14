import { LenderTeamContactsPage } from '../../../_components/lender-team-pages';
import { loadTeamWorkspace } from '../../layout';

export default async function TeamLenderContactsPage(props: {
  params: Promise<{ account: string }>;
}) {
  const { account } = await props.params;
  const { team } = await loadTeamWorkspace(account);

  return (
    <LenderTeamContactsPage teamId={team.id} teamPath={`/home/${account}`} />
  );
}
