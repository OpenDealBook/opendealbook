import { redirect } from 'next/navigation';

import { listTodos } from '@odb/deals/server';
import { getSupabaseServerClient } from '@odb/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@odb/ui/card';

import { DealTodos } from '../../../../_components/deal-todos';

export default async function UserDealTodosPage(props: {
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

  const todos = await listTodos({ deal_id: id });

  return (
    <main className={'flex flex-col gap-6 p-8'}>
      <Card>
        <CardHeader>
          <CardTitle>To-dos</CardTitle>
        </CardHeader>
        <CardContent>
          <DealTodos accountId={user.id} dealId={id} todos={todos} />
        </CardContent>
      </Card>
    </main>
  );
}
