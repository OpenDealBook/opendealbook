import { getSupabaseServerAdminClient } from '@odb/supabase/server';
import { startTrialDrip } from '@odb/workflows/client';

import appConfig from '../../../../config/app.config';
import featureFlagsConfig from '../../../../config/feature-flags.config';

export async function startTeamTrialDrip(
  team: { id: string; slug: string | null },
  owner: { id: string; email?: string | null },
): Promise<void> {
  if (!featureFlagsConfig.enableBilling || !owner.email) {
    return;
  }

  const teamHome = `${appConfig.url}/home/${team.slug}`;

  await startTrialDrip({
    accountId: team.id,
    userId: owner.id,
    email: owner.email,
    productName: appConfig.name,
    upgradeLink: `${teamHome}/billing`,
    actionLink: teamHome,
  });

  await getSupabaseServerAdminClient()
    .from('accounts')
    .update({ trial_drip_started_at: new Date().toISOString() })
    .eq('id', team.id)
    .throwOnError();
}

export async function resumeTrialDrip(teamId: string): Promise<void> {
  if (!featureFlagsConfig.enableBilling) {
    return;
  }

  const admin = getSupabaseServerAdminClient();
  const { data: team } = await admin
    .from('accounts')
    .select('slug, primary_owner_user_id, trial_ends_at, trial_drip_started_at')
    .eq('id', teamId)
    .single()
    .throwOnError();

  if (
    team.trial_drip_started_at !== null ||
    team.trial_ends_at === null ||
    new Date(team.trial_ends_at) <= new Date()
  ) {
    return;
  }

  const { data: owner } = await admin
    .from('accounts')
    .select('id, email')
    .eq('id', team.primary_owner_user_id)
    .single()
    .throwOnError();

  await startTeamTrialDrip({ id: teamId, slug: team.slug }, owner);
}
