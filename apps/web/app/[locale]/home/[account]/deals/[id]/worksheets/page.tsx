import { fetchWorksheetRows } from '@odb/deals/shared';
import { getSupabaseServerClient } from '@odb/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@odb/ui/card';

import { DealWorksheets } from '../../../../_components/deal-worksheets';
import { loadTeamWorkspace } from '../../../layout';

interface TeamDealWorksheetsPageProps {
  params: Promise<{ locale: string; account: string; id: string }>;
}

export default async function TeamDealWorksheetsPage({
  params,
}: TeamDealWorksheetsPageProps) {
  const { account, id } = await params;
  await loadTeamWorkspace(account);

  const client = getSupabaseServerClient();
  const rows = await fetchWorksheetRows(client, { deal_id: id });

  return (
    <main className={'flex flex-col gap-6 p-8'}>
      <Card>
        <CardHeader>
          <CardTitle>Worksheets</CardTitle>
        </CardHeader>
        <CardContent>
          <DealWorksheets dealId={id} rows={rows} />
        </CardContent>
      </Card>
    </main>
  );
}
