'use server';

import { enhanceAction } from '@odb/next/actions';
import { getSupabaseServerClient } from '@odb/supabase/server';
import { acceptInvitationSchema } from '@odb/team-accounts/schema';
import { acceptInvitationAction } from '@odb/team-accounts/server';

import { isLiveInvitation } from './live-invitation';

export const joinTeamAction = enhanceAction(
  async (
    { token },
    user,
  ): Promise<{ redirectTo: string } | { expired: true }> => {
    if (!(await isLiveInvitation(token))) {
      return { expired: true };
    }

    const { accountId } = await acceptInvitationAction({ token });
    const client = getSupabaseServerClient();

    const [{ data: team }, { data: personal }] = await Promise.all([
      client
        .from('accounts')
        .select('slug')
        .eq('id', accountId)
        .single()
        .throwOnError(),
      client
        .from('accounts')
        .select('onboarded')
        .eq('primary_owner_user_id', user.id)
        .eq('is_personal_account', true)
        .single()
        .throwOnError(),
    ]);

    return {
      redirectTo: personal.onboarded
        ? `/home/${team.slug}`
        : `/onboarding?team=${team.slug}`,
    };
  },
  { auth: true, schema: acceptInvitationSchema },
);
