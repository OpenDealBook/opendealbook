import { redirect } from 'next/navigation';

import { getSupabaseServerClient } from '@odb/supabase/server';

import { DealDetail } from '../../../_components/deal-detail';

export default async function UserDealDetailPage(props: {
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

  return (
    <main className={'flex flex-col gap-6 p-8'}>
      <DealDetail accountId={user.id} dealId={id} />
    </main>
  );
}
