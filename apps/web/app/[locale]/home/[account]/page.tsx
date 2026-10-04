import { getSupabaseServerClient } from '@odb/supabase/server';

import { ensureTrialSampleData } from '../_lib/ensure-trial-sample-data';
import { loadTeamWorkspace } from './layout';

interface TeamHomePageProps {
  params: Promise<{ locale: string; account: string }>;
}

export default async function TeamHomePage({ params }: TeamHomePageProps) {
  const { account } = await params;
  const { team, user } = await loadTeamWorkspace(account);

  await ensureTrialSampleData(getSupabaseServerClient(), {
    accountId: team.id,
    userId: user.id,
  });

  return (
    <main className={'p-8'}>
      <h1 className={'text-2xl font-semibold'}>{team.name}</h1>
    </main>
  );
}
