import { fetchDealCalcVersions } from '@odb/deals';
import { getSupabaseServerClient } from '@odb/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@odb/ui/card';

import { CalculatorsPanel } from './calc-panel';

export async function CalculatorsSection(props: {
  dealId: string;
  accountId: string;
}) {
  const client = getSupabaseServerClient();
  const [versions, { data: canManage }, { data: team }] = await Promise.all([
    fetchDealCalcVersions(client, { deal_id: props.dealId }),
    client
      .rpc('manages_deal_in_account', {
        deal_id: props.dealId,
        account_id: props.accountId,
      })
      .throwOnError(),
    client
      .from('accounts')
      .select('slug')
      .eq('id', props.accountId)
      .single()
      .throwOnError(),
  ]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Calculators</CardTitle>
      </CardHeader>
      <CardContent>
        <CalculatorsPanel
          dealId={props.dealId}
          versions={versions}
          canManage={canManage}
          calcsHref={`/home/${team.slug}/deals/${props.dealId}/financials/calcs`}
        />
      </CardContent>
    </Card>
  );
}
