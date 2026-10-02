import { redirect } from 'next/navigation';

import { getSupabaseServerClient } from '@odb/supabase/server';

import { DealsList } from '../../_components/deals-list';

export default async function UserDealsPage(props: {
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

  return (
    <main className={'flex flex-col gap-6 p-8'}>
      <h1 className={'text-2xl font-semibold'}>Deals</h1>
      <DealsList accountId={user.id} />
    </main>
  );
}
