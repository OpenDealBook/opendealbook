'use server';

import { seedExampleDeals } from '@odb/deals/server/seed-example-deals';
import { enhanceAction } from '@odb/next/actions';
import { onboardingSubmissionSchema } from '@odb/onboarding/schema';
import { getLogger } from '@odb/shared/logger';
import type { Json } from '@odb/supabase';
import {
  getSupabaseServerAdminClient,
  getSupabaseServerClient,
} from '@odb/supabase/server';
import { createTeamAccountAction } from '@odb/team-accounts/server';

import type { OnboardingResult } from '@odb/onboarding';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
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

    let workspaceAccountId = account.id;

    if (submission.workspace.kind === 'team') {
      const team = await createTeamAccountAction({
        name: submission.workspace.teamName,
        slug: slugify(submission.workspace.teamName),
      });
      workspaceAccountId = team.id;
    }

    if (submission.dealBox) {
      const criteria = submission.dealBox.criteria;

      const { data: latest } = await admin
        .from('deal_box')
        .select('version')
        .eq('account_id', workspaceAccountId)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle();

      await admin
        .from('deal_box')
        .insert({
          account_id: workspaceAccountId,
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

    await admin
      .from('comp_pool_optin')
      .upsert(
        {
          account_id: workspaceAccountId,
          opted_in: submission.terms.compPoolOptin,
          opted_in_at: submission.terms.compPoolOptin
            ? new Date().toISOString()
            : null,
        },
        { onConflict: 'account_id' },
      )
      .throwOnError();

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

    try {
      await seedExampleDeals({
        accountId: workspaceAccountId,
        userId: user.id,
        client: admin,
      });
    } catch (error) {
      getLogger().warn(
        { err: error, accountId: workspaceAccountId },
        'Failed to seed example deals during onboarding completion',
      );
    }

    return { redirectTo: enrollMfa ? '/mfa-setup' : '/home' };
  },
  { auth: true, schema: onboardingSubmissionSchema },
);
