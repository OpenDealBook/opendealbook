import { redirect } from 'next/navigation';

import { PersonalAccountSettingsContainer } from '@odb/accounts/personal-account-settings';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { PhoneSetting } from './phone-setting';
import { TimezoneSetting } from './timezone-setting';

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

  const { data: account } = await client
    .from('accounts')
    .select('timezone, phone')
    .eq('id', user.id)
    .single()
    .throwOnError();

  return (
    <main className={'flex flex-col gap-6 p-8'}>
      <h1 className={'text-2xl font-semibold'}>Settings</h1>

      <PersonalAccountSettingsContainer userId={user.id}>
        <PhoneSetting current={account.phone} />
        <TimezoneSetting current={account.timezone} />
      </PersonalAccountSettingsContainer>
    </main>
  );
}
