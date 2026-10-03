import { OutreachArea } from '../../_components/outreach/outreach-area';
import { loadTeamWorkspace } from '../layout';

interface TeamOutreachPageProps {
  params: Promise<{ locale: string; account: string }>;
}

export default async function TeamOutreachPage({
  params,
}: TeamOutreachPageProps) {
  const { account } = await params;
  const { team } = await loadTeamWorkspace(account);

  return (
    <main className={'flex flex-col gap-6 p-8'}>
      <h1 className={'text-2xl font-semibold'}>Outreach</h1>
      <OutreachArea accountId={team.id} />
    </main>
  );
}
