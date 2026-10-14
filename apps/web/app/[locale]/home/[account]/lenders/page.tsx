import { LenderTeamRoomsPage } from '../../_components/lender-team-pages';
import { loadTeamWorkspace } from '../layout';

export default async function TeamLenderRoomsPage(props: {
  params: Promise<{ account: string }>;
}) {
  const { account } = await props.params;
  const { team } = await loadTeamWorkspace(account);

  return <LenderTeamRoomsPage teamId={team.id} teamPath={`/home/${account}`} />;
}
