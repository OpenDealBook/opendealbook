import Link from 'next/link';
import { notFound } from 'next/navigation';

import { fetchDealCalcVersions } from '@odb/deals';
import { fetchCalcVersion, fetchDealBox } from '@odb/deals/shared';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { CalcCompare } from '../../../../../../_components/calc-compare';
import { loadDealCalcDefaults } from '../../../../../../_lib/deal-calc-defaults';
import { loadTeamWorkspace } from '../../../../../layout';

export default async function TeamDealCalcComparePage({
  params,
  searchParams,
}: {
  params: Promise<{ account: string; id: string }>;
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const [{ account, id }, { a, b }] = await Promise.all([params, searchParams]);
  const { team } = await loadTeamWorkspace(account);
  const client = getSupabaseServerClient();

  const [{ data: deal }, versions, defaults, dealBox] = await Promise.all([
    client
      .from('deal')
      .select('id')
      .eq('id', id)
      .eq('account_id', team.id)
      .maybeSingle()
      .throwOnError(),
    fetchDealCalcVersions(client, { deal_id: id }),
    loadDealCalcDefaults(client, team.id),
    fetchDealBox(client, team.id),
  ]);

  if (!deal) {
    notFound();
  }
  const versionA = versions.find((version) => version.id === a);
  const versionB = versions.find((version) => version.id === b);

  if (!versionA || !versionB || versionA.type !== versionB.type) {
    notFound();
  }

  const [detailA, detailB] = await Promise.all([
    fetchCalcVersion(client, { calc_version_id: versionA.id }),
    fetchCalcVersion(client, { calc_version_id: versionB.id }),
  ]);

  return (
    <main className={'flex min-w-0 flex-col gap-6 p-4 md:p-8'}>
      <div className={'flex flex-col gap-2'}>
        <Link
          href={`/home/${account}/deals/${id}/financials`}
          className={
            'text-muted-foreground hover:text-foreground w-fit text-sm'
          }
        >
          Back to Financials
        </Link>
        <h1 className={'text-xl font-semibold'}>Compare versions</h1>
      </div>
      <CalcCompare
        a={detailA}
        b={detailB}
        versions={versions
          .filter((version) => version.type === versionA.type)
          .map(
            ({ id, name, type, created_at, updated_at, outputs_snapshot }) => ({
              id,
              name,
              type,
              created_at,
              updated_at,
              outputs_snapshot,
            }),
          )}
        defaults={defaults}
        dealBoxSet={dealBox !== null}
        calcsHref={`/home/${account}/deals/${id}/financials/calcs`}
      />
    </main>
  );
}
