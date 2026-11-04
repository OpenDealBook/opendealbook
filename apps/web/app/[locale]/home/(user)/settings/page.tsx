import { redirect } from 'next/navigation';

import { PersonalAccountSettingsContainer } from '@odb/accounts/personal-account-settings';
import { getSupabaseServerClient } from '@odb/supabase/server';
import { PageHeader } from '@odb/ui/page-header';

import { zoneChoices } from '../../_components/time-zones';
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
      <PageHeader title={'Settings'} />

      <PersonalAccountSettingsContainer userId={user.id}>
        <PhoneSetting current={account.phone} />
        <TimezoneSetting
          current={account.timezone}
          zones={zoneChoices(account.timezone)}
        />
      </PersonalAccountSettingsContainer>
    </main>
  );
}
