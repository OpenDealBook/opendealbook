import { redirect } from 'next/navigation';

import { getSupabaseServerClient } from '@odb/supabase/server';

import { DealCloseSection } from '../../../../_components/deal-close-section';

export default async function UserDealClosePage(props: {
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
      <DealCloseSection accountId={user.id} dealId={id} />
    </main>
  );
}
