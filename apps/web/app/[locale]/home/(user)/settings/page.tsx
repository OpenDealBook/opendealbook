import { redirect } from 'next/navigation';

import { PersonalAccountSettingsContainer } from '@tuckin/accounts/personal-account-settings';
import { getSupabaseServerClient } from '@tuckin/supabase/server';

export default async function PersonalAccountSettingsPage(props: {
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
      <h1 className={'text-2xl font-semibold'}>Settings</h1>

      <PersonalAccountSettingsContainer userId={user.id} />
    </main>
  );
}
