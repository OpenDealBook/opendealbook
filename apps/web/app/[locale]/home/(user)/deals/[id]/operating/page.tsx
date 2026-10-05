import { redirect } from 'next/navigation';

import {
  computeOperatingSummary,
  fetchDealFinancials,
  fetchDealOperatingPeriods,
} from '@odb/deals/shared';
import { getSupabaseServerClient } from '@odb/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@odb/ui/card';

import { DealOperating } from '../../../../_components/deal-operating';

export default async function UserDealOperatingPage(props: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { id } = await props.params;

  const client = getSupabaseServerClient();

  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    redirect('/auth/sign-in');
  }

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
            accountId={user.id}
            periods={periods}
            summary={summary}
          />
        </CardContent>
      </Card>
    </main>
  );
}
