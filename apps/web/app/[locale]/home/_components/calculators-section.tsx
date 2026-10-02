import { fetchDealCalcVersions } from '@odb/deals';
import { getSupabaseServerClient } from '@odb/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@odb/ui/card';

import { CalculatorsPanel } from './calc-panel';

export async function CalculatorsSection(props: {
  dealId: string;
  accountId: string;
}) {
  const client = getSupabaseServerClient();
  const versions = await fetchDealCalcVersions(client, {
    deal_id: props.dealId,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Calculators</CardTitle>
      </CardHeader>
      <CardContent>
        <CalculatorsPanel dealId={props.dealId} versions={versions} />
      </CardContent>
    </Card>
  );
}
