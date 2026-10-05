import {
  computeOperatingSummary,
  fetchDealFinancials,
  fetchDealOperatingPeriods,
} from '@odb/deals/shared';
import { getSupabaseServerClient } from '@odb/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@odb/ui/card';

import { DealOperating } from '../../../../_components/deal-operating';
import { loadTeamWorkspace } from '../../../layout';

interface TeamDealOperatingPageProps {
  params: Promise<{ locale: string; account: string; id: string }>;
}

export default async function TeamDealOperatingPage({
  params,
}: TeamDealOperatingPageProps) {
  const { account, id } = await params;
  const { team } = await loadTeamWorkspace(account);

  const client = getSupabaseServerClient();
  const [periods, financials] = await Promise.all([
    fetchDealOperatingPeriods(client, { deal_id: id }),
    fetchDealFinancials(client, { deal_id: id }),
  ]);

  const summary = computeOperatingSummary(periods, {
    adopted_revenue: financials?.adopted_revenue ?? null,
    adopted_sde: financials?.adopted_sde ?? null,
    adopted_ebitda: financials?.adopted_ebitda ?? null,
  });

  return (
    <main className={'flex flex-col gap-6 p-8'}>
      <Card>
        <CardHeader>
          <CardTitle>Operating</CardTitle>
        </CardHeader>
        <CardContent>
          <DealOperating
            dealId={id}
            accountId={team.id}
            periods={periods}
            summary={summary}
          />
        </CardContent>
      </Card>
    </main>
  );
}
