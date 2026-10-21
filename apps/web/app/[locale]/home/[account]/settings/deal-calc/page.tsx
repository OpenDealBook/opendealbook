import { getSupabaseServerClient } from '@odb/supabase/server';

import { loadDealCalcDefaults } from '../../../_lib/deal-calc-defaults';
import { loadTeamWorkspace } from '../../layout';
import { DealCalcDefaultsForm } from './_components/deal-calc-defaults-form';

interface DealCalcDefaultsPageProps {
  params: Promise<{ locale: string; account: string }>;
}

export default async function DealCalcDefaultsPage({
  params,
}: DealCalcDefaultsPageProps) {
  const { account } = await params;
  const { team, permissions } = await loadTeamWorkspace(account);
  const defaults = await loadDealCalcDefaults(
    getSupabaseServerClient(),
    team.id,
  );

  return (
    <main className={'flex flex-col gap-6 p-8'}>
      <h1 className={'text-2xl font-semibold'}>Deal calc defaults</h1>
      <DealCalcDefaultsForm
        accountId={team.id}
        defaults={defaults}
        canManage={permissions.includes('settings.manage')}
      />
    </main>
  );
}
