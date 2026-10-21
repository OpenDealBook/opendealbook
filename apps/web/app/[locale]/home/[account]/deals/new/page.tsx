import { getSupabaseServerClient } from '@odb/supabase/server';

import { NewDealForm } from '../../../_components/new-deal-form';
import { loadTeamWorkspace } from '../../layout';

interface NewTeamDealPageProps {
  params: Promise<{ locale: string; account: string }>;
}

export default async function NewTeamDealPage({
  params,
}: NewTeamDealPageProps) {
  const { account } = await params;
  const { team } = await loadTeamWorkspace(account);
  const client = getSupabaseServerClient();

  const [{ data: industries }, { data: deals }] = await Promise.all([
    client
      .from('industry')
      .select('id, name')
      .eq('account_id', team.id)
      .order('name')
      .throwOnError(),
    client
      .from('deal')
      .select('firm:firm_id!inner(name)')
      .eq('account_id', team.id)
      .throwOnError(),
  ]);

  return (
    <main className={'flex flex-col gap-6 p-8'}>
      <h1 className={'text-2xl font-semibold'}>New deal</h1>
      <NewDealForm
        accountId={team.id}
        detailBasePath={`/home/${account}/deals`}
        industries={industries}
        existingBusinessNames={deals.map((deal) => deal.firm.name)}
      />
    </main>
  );
}
