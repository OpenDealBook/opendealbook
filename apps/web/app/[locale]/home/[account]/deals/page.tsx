import { DealsList } from '../../_components/deals-list';
import { loadTeamWorkspace } from '../layout';

interface TeamDealsPageProps {
  params: Promise<{ locale: string; account: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function TeamDealsPage({
  params,
  searchParams,
}: TeamDealsPageProps) {
  const { account } = await params;
  const { team } = await loadTeamWorkspace(account);
  const resolvedSearchParams = await searchParams;

  return (
    <main className={'flex flex-col gap-6 p-8'}>
      <h1 className={'text-2xl font-semibold'}>Deals</h1>
      <DealsList accountId={team.id} searchParams={resolvedSearchParams} />
    </main>
  );
}
