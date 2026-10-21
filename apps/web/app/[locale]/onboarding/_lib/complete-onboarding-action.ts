'use server';

import type { User } from '@supabase/supabase-js';

import { enhanceAction } from '@odb/next/actions';
import type { OnboardingResult } from '@odb/onboarding';
import { onboardingSubmissionSchema } from '@odb/onboarding/schema';
import { getLogger } from '@odb/shared/logger';
import type { Json } from '@odb/supabase';
import {
  getSupabaseServerAdminClient,
  getSupabaseServerClient,
} from '@odb/supabase/server';
import { createTeamAccountAction } from '@odb/team-accounts/server';

import { startTeamTrialDrip } from '../../home/_lib/trial-drip';
import { findMemberTeam } from './member-team';

async function invitedTeam(
  client: ReturnType<typeof getSupabaseServerClient>,
  slug: string,
) {
  const team = await findMemberTeam(client, slug);

  if (!team) {
    throw new Error('Not a member of this team');
  }

  return team;
}

async function buyerTeam(
  client: ReturnType<typeof getSupabaseServerClient>,
  user: User,
  teamName: string,
) {
  const { data: existing } = await client
    .from('accounts')
    .select('id, slug')
    .eq('primary_owner_user_id', user.id)
    .eq('is_personal_account', false)
    .maybeSingle()
    .throwOnError();

  if (existing) {
    return existing;
  }

  const team = await createTeamAccountAction({ name: teamName });

  try {
    await startTeamTrialDrip(team, user);
  } catch (error) {
    getLogger().warn(
      { err: error, accountId: team.id },
      'Failed to start the trial drip for a new team; its next home visit retries',
    );
  }

  return team;
}

export const completeOnboardingAction = enhanceAction(
  async (submission, user): Promise<OnboardingResult> => {
    const client = getSupabaseServerClient();
    const admin = getSupabaseServerAdminClient();

    const { data: account, error } = await client
      .from('accounts')
      .select('id, public_data')
      .eq('primary_owner_user_id', user.id)
      .eq('is_personal_account', true)
      .single();

    if (error) {
      throw error;
    }

    const team =
      submission.kind === 'invitee'
        ? await invitedTeam(client, submission.teamSlug)
        : await buyerTeam(client, user, submission.workspace.teamName);

    if (submission.kind === 'buyer' && submission.dealBox) {
      const criteria = submission.dealBox.criteria;

      const { data: latest } = await admin
        .from('deal_box')
        .select('version')
        .eq('account_id', team.id)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle();

      await admin
        .from('deal_box')
        .insert({
          account_id: team.id,
          version: (latest?.version ?? 0) + 1,
          criteria_json: {
            industries: criteria.industries,
            naics: criteria.naics,
            states: criteria.states,
            min_revenue: criteria.minRevenue,
            max_asking_price: criteria.maxAskingPrice,
          },
          updated_by: user.id,
        })
        .throwOnError();
    }

    if (submission.kind === 'buyer') {
      await admin
        .from('comp_pool_optin')
        .upsert(
          {
            account_id: team.id,
            opted_in: submission.terms.compPoolOptin,
            opted_in_at: submission.terms.compPoolOptin
              ? new Date().toISOString()
              : null,
          },
          { onConflict: 'account_id' },
        )
        .throwOnError();
    }

    const enrollMfa = submission.mfa?.enroll === true;

    const publicData: Json = {
      ...(account.public_data as Record<string, Json>),
      terms_accepted_at: new Date().toISOString(),
      ...(enrollMfa ? { mfa_enroll_requested: true } : {}),
    };

    await admin
      .from('accounts')
      .update({
        name: submission.profile.name,
        picture_url: submission.profile.pictureUrl ?? null,
        onboarded: true,
        public_data: publicData,
      })
      .eq('id', account.id)
      .throwOnError();

    return {
      redirectTo: enrollMfa
        ? `/mfa-setup?team=${team.slug}`
        : `/home/${team.slug}`,
    };
  },
  { auth: true, schema: onboardingSubmissionSchema },
);
