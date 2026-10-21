import { after } from 'next/server';

import { TeamAgenda } from '../_components/team-agenda';
import { ensureSampleDeals } from '../_lib/ensure-trial-sample-data';
import { loadTeamAgenda, markTeamHomeVisited } from '../_lib/team-agenda';
import { resumeTrialDrip } from '../_lib/trial-drip';
import { loadTeamWorkspace } from './layout';

interface TeamHomePageProps {
  params: Promise<{ locale: string; account: string }>;
  searchParams: Promise<{ scope?: string }>;
}

export default async function TeamHomePage({
  params,
  searchParams,
}: TeamHomePageProps) {
  const { account } = await params;
  const { scope } = await searchParams;
  const { team, user, permissions } = await loadTeamWorkspace(account);
  const manager = permissions.includes('deals.manage');
  const wholeTeam = manager && scope === 'team';

  const sampleDealsNotice = await ensureSampleDeals({
    accountId: team.id,
    userId: user.id,
  });
  const rows = await loadTeamAgenda(team.id, wholeTeam);

  after(() => resumeTrialDrip(team.id));
  after(() => markTeamHomeVisited(team.id));

  return (
    <main className={'flex flex-col gap-4 p-8'}>
      {sampleDealsNotice ? (
        <p role={'alert'} className={'text-destructive text-sm'}>
          {sampleDealsNotice}
        </p>
      ) : null}
      <TeamAgenda
        account={account}
        rows={rows}
        wholeTeam={manager ? wholeTeam : null}
        showsLenders={manager}
      />
    </main>
  );
}
