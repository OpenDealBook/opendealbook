import { redirect } from 'next/navigation';

import { getSupabaseServerClient } from '@odb/supabase/server';

import { NewDealForm } from '../../../_components/new-deal-form';

export default async function NewUserDealPage(props: {
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
      <h1 className={'text-2xl font-semibold'}>New deal</h1>
      <NewDealForm accountId={user.id} detailBasePath={'/home/deals'} />
    </main>
  );
}
