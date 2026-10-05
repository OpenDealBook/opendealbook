import { redirect } from 'next/navigation';

import { fetchWorksheetRows } from '@odb/deals/shared';
import { getSupabaseServerClient } from '@odb/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@odb/ui/card';

import { DealWorksheets } from '../../../../_components/deal-worksheets';

export default async function UserDealWorksheetsPage(props: {
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
