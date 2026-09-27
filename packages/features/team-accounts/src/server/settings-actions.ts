'use server';

import { enhanceAction } from '@tuckin/next/actions';
import { getSupabaseServerClient } from '@tuckin/supabase/server';

import {
  deleteTeamSchema,
  type DeleteTeamData,
} from '../schema/delete-team.schema';
import {
  updateTeamSchema,
  type UpdateTeamData,
} from '../schema/update-team.schema';

async function assertSettingsManager(
  client: ReturnType<typeof getSupabaseServerClient>,
  accountId: string,
  userId: string,
) {
  const { data: allowed, error } = await client.rpc('has_permission', {
    account_id: accountId,
    permission_name: 'settings.manage',
    user_id: userId,
  });

  if (error) {
    throw error;
  }

  if (!allowed) {
    throw new Error('Not allowed to manage team settings');
  }
}

async function updateTeam(data: UpdateTeamData, user: { id: string }) {
  const client = getSupabaseServerClient();

  await assertSettingsManager(client, data.accountId, user.id);

  const { error } = await client
    .from('accounts')
    .update({ name: data.name, slug: data.slug })
    .eq('id', data.accountId);

  if (error) {
    throw error;
  }

  return { success: true };
}

async function deleteTeam(data: DeleteTeamData) {
  const client = getSupabaseServerClient();

  const { data: isOwner, error: ownerError } = await client.rpc(
    'is_account_owner',
    { account_id: data.accountId },
  );

  if (ownerError) {
    throw ownerError;
  }

  if (!isOwner) {
    throw new Error('Only the account owner can delete the team');
  }

  const { error } = await client
    .from('accounts')
    .delete()
    .eq('id', data.accountId);

  if (error) {
    throw error;
  }

  return { success: true };
}

export const updateTeamAction = enhanceAction(updateTeam, {
  auth: true,
  schema: updateTeamSchema,
});

export const deleteTeamAction = enhanceAction(deleteTeam, {
  auth: true,
  schema: deleteTeamSchema,
});
