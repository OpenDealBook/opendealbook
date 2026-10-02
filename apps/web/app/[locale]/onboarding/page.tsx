import { redirect } from 'next/navigation';

import { getSupabaseServerClient } from '@odb/supabase/server';

import { OnboardingContainer } from './_components/onboarding-container';
import { completeOnboardingAction } from './_lib/complete-onboarding-action';

export default async function OnboardingPage(props: {
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

  const { data: account, error } = await client
    .from('accounts')
    .select('onboarded')
    .eq('primary_owner_user_id', user.id)
    .eq('is_personal_account', true)
    .single();

  if (error) {
    throw error;
  }

  if (account.onboarded) {
    redirect('/home');
  }

  return <OnboardingContainer onComplete={completeOnboardingAction} />;
}
