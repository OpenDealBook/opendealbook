import { ensureTrialSampleData } from '../_lib/trial-actions';
import { loadTeamWorkspace } from './layout';

interface TeamHomePageProps {
  params: Promise<{ locale: string; account: string }>;
}

export default async function TeamHomePage({ params }: TeamHomePageProps) {
  const { account } = await params;
  const { team } = await loadTeamWorkspace(account);

  await ensureTrialSampleData({ accountId: team.id });

  return (
    <main className={'p-8'}>
      <h1 className={'text-2xl font-semibold'}>{team.name}</h1>
    </main>
  );
}
