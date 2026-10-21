import { notFound } from 'next/navigation';

import { fetchDealCalcVersions } from '@odb/deals';
import { fetchCalcVersion, fetchDealBox } from '@odb/deals/shared';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { loadDealCalcDefaults } from '../../../../../../_lib/deal-calc-defaults';
import { loadTeamWorkspace } from '../../../../../layout';
import { CalcVersionEditor } from './calc-version-editor';

export default async function TeamDealCalcPage({
  params,
}: {
  params: Promise<{ account: string; id: string; calcId: string }>;
}) {
  const { account, id, calcId } = await params;
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

  if (!deal || !versions.some((version) => version.id === calcId)) {
    notFound();
  }

  const detail = await fetchCalcVersion(client, { calc_version_id: calcId });

  return (
    <main className={'flex min-w-0 flex-col gap-6 p-4 md:p-8'}>
      <CalcVersionEditor
        detail={detail}
        versions={versions.map(
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
        dealBox={{
          set: dealBox !== null,
          href: `/home/${account}/underwriting`,
        }}
        financialsHref={`/home/${account}/deals/${id}/financials`}
        calcsHref={`/home/${account}/deals/${id}/financials/calcs`}
      />
    </main>
  );
}
