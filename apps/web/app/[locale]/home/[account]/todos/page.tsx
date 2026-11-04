import { fetchMyTodos } from '@odb/deals';
import { getSupabaseServerClient } from '@odb/supabase/server';
import { PageHeader } from '@odb/ui/page-header';

import { ItemFocus } from '../../_components/item-focus';
import { MyTodosView } from '../../_components/my-todos-view';
import { loadTeamWorkspace } from '../layout';

interface TeamTodosPageProps {
  params: Promise<{ locale: string; account: string }>;
}

export default async function TeamTodosPage({ params }: TeamTodosPageProps) {
  const { account } = await params;
  const { user, team } = await loadTeamWorkspace(account);

  const client = getSupabaseServerClient();
  const data = await fetchMyTodos(client, user.id, team.id);

  return (
    <main className={'flex flex-col gap-6 p-8'}>
      <PageHeader title={'My to-dos'} />
      <ItemFocus />
      <MyTodosView
        data={data}
        dealHref={(dealId) => `/home/${account}/deals/${dealId}`}
      />
    </main>
  );
}
