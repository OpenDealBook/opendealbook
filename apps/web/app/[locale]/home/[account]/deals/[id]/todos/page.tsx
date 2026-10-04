import { listTodos } from '@odb/deals/server';
import { Card, CardContent, CardHeader, CardTitle } from '@odb/ui/card';

import { DealTodos } from '../../../../_components/deal-todos';
import { loadTeamWorkspace } from '../../../layout';

interface TeamDealTodosPageProps {
  params: Promise<{ locale: string; account: string; id: string }>;
}

export default async function TeamDealTodosPage({
  params,
}: TeamDealTodosPageProps) {
  const { account, id } = await params;
  const { team } = await loadTeamWorkspace(account);

  const todos = await listTodos({ deal_id: id });

  return (
    <main className={'flex flex-col gap-6 p-8'}>
      <Card>
        <CardHeader>
          <CardTitle>To-dos</CardTitle>
        </CardHeader>
        <CardContent>
          <DealTodos accountId={team.id} dealId={id} todos={todos} />
        </CardContent>
      </Card>
    </main>
  );
}
