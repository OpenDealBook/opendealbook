import { notFound, redirect } from 'next/navigation';

import { getSupabaseServerClient } from '@odb/supabase/server';

import { resolveTeamLanding } from '../home/_lib/team-landing';
import { OnboardingContainer } from './_components/onboarding-container';
import { completeOnboardingAction } from './_lib/complete-onboarding-action';
import { findJoinedTeamsNotOwned, findMemberTeam } from './_lib/member-team';

export default async function OnboardingPage(props: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ team?: string }>;
}) {
  const [, { team }] = await Promise.all([props.params, props.searchParams]);

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
    const landing = await resolveTeamLanding(client, user.id);

    redirect(landing.kind === 'go' ? landing.path : '/home');
  }

  if (team && !(await findMemberTeam(client, team))) {
    notFound();
  }

  if (!team) {
    const joined = await findJoinedTeamsNotOwned(client, user.id);

    if (joined.length === 1) {
      redirect(
        `/onboarding?${new URLSearchParams({ team: joined[0]!.slug! })}`,
      );
    }
  }

  return (
    <OnboardingContainer
      flow={team ? { kind: 'invitee', teamSlug: team } : { kind: 'buyer' }}
      onComplete={completeOnboardingAction}
    />
  );
}
