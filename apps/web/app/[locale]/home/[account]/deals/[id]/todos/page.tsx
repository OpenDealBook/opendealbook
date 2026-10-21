import { listTodos } from '@odb/deals/server';
import {
  getSupabaseServerAdminClient,
  getSupabaseServerClient,
} from '@odb/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@odb/ui/card';

import { DealTodos } from '../../../../_components/deal-todos';
import { loadTeamWorkspace } from '../../../layout';

interface TeamDealTodosPageProps {
  params: Promise<{ locale: string; account: string; id: string }>;
}

async function teamMembers(teamId: string) {
  const { data: memberships } = await getSupabaseServerClient()
    .from('accounts_memberships')
    .select('user_id')
    .eq('account_id', teamId)
    .throwOnError();

  // Service role: teammates cannot read each other's personal accounts, and
  // these ids come from memberships the caller was already allowed to read.
  const { data: people } = await getSupabaseServerAdminClient()
    .from('accounts')
    .select('primary_owner_user_id, name')
    .eq('is_personal_account', true)
    .in(
      'primary_owner_user_id',
      memberships.map((membership) => membership.user_id),
    )
    .order('name')
    .throwOnError();

  return people.map((person) => ({
    userId: person.primary_owner_user_id,
    name: person.name,
  }));
}

export default async function TeamDealTodosPage({
  params,
}: TeamDealTodosPageProps) {
  const { account, id } = await params;
  const { user, team } = await loadTeamWorkspace(account);

  const [todos, members] = await Promise.all([
    listTodos({ deal_id: id }),
    teamMembers(team.id),
  ]);

  return (
    <main className={'flex min-w-0 flex-col gap-6 p-4 md:p-8'}>
      <Card>
        <CardHeader>
          <CardTitle>To-dos</CardTitle>
        </CardHeader>
        <CardContent>
          <DealTodos
            accountId={team.id}
            dealId={id}
            currentUserId={user.id}
            members={members}
            todos={todos}
          />
        </CardContent>
      </Card>
    </main>
  );
}
