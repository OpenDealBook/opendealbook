import { redirect } from 'next/navigation';

import { getSupabaseServerClient } from '@odb/supabase/server';

import { OutreachArea } from '../../_components/outreach/outreach-area';

export default async function UserOutreachPage(props: {
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
      <h1 className={'text-2xl font-semibold'}>Outreach</h1>
      <OutreachArea accountId={user.id} />
    </main>
  );
}
