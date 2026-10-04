import { redirect } from 'next/navigation';

import { fetchMyTodos } from '@odb/deals';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { MyTodosView } from '../../_components/my-todos-view';

export default async function UserTodosPage(props: {
  params: Promise<{ locale: string }>;
}) {
  await props.params;

  const client = getSupabaseServerClient();

  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    redirect('/auth/sign-in');
  }

  const data = await fetchMyTodos(client, user.id);

  return (
    <main className={'flex flex-col gap-6 p-8'}>
      <h1 className={'text-2xl font-semibold'}>My to-dos</h1>
      <MyTodosView data={data} dealHref={(dealId) => `/home/deals/${dealId}`} />
    </main>
  );
}
