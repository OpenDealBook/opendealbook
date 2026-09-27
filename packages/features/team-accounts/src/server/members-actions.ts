'use server';

import { enhanceAction } from '@tuckin/next/actions';
import {
  getSupabaseServerAdminClient,
  getSupabaseServerClient,
} from '@tuckin/supabase/server';

import {
  leaveTeamSchema,
  type LeaveTeamData,
} from '../schema/leave-team.schema';
import {
  removeMemberSchema,
  type RemoveMemberData,
} from '../schema/remove-member.schema';
import {
  transferOwnershipSchema,
  type TransferOwnershipData,
} from '../schema/transfer-ownership.schema';
import {
  updateMemberRoleSchema,
  type UpdateMemberRoleData,
} from '../schema/update-member-role.schema';

async function assertCanActionMember(
  client: ReturnType<typeof getSupabaseServerClient>,
  accountId: string,
  userId: string,
) {
  const { data: canAction, error } = await client.rpc(
    'can_action_account_member',
    { target_team_account_id: accountId, target_user_id: userId },
  );

  if (error) {
    throw error;
  }

  if (!canAction) {
    throw new Error('Not allowed to action this member');
  }
}

async function updateMemberRole(data: UpdateMemberRoleData) {
  const client = getSupabaseServerClient();

  await assertCanActionMember(client, data.accountId, data.userId);

  const { error } = await client
    .from('accounts_memberships')
    .update({ account_role: data.role })
    .eq('account_id', data.accountId)
    .eq('user_id', data.userId);

  if (error) {
    throw error;
  }

  return { success: true };
}

async function removeMember(data: RemoveMemberData) {
  const client = getSupabaseServerClient();

  await assertCanActionMember(client, data.accountId, data.userId);

  const { error } = await client
    .from('accounts_memberships')
    .delete()
    .eq('account_id', data.accountId)
    .eq('user_id', data.userId);

  if (error) {
    throw error;
  }

  return { success: true };
}

async function leaveTeam(data: LeaveTeamData, user: { id: string }) {
  const client = getSupabaseServerClient();

  const { error } = await client
    .from('accounts_memberships')
    .delete()
    .eq('account_id', data.accountId)
    .eq('user_id', user.id);

  if (error) {
    throw error;
  }

  return { success: true };
}

async function transferOwnership(data: TransferOwnershipData) {
  const client = getSupabaseServerAdminClient();

  const { error } = await client.rpc('transfer_team_account_ownership', {
    new_owner_id: data.userId,
    target_account_id: data.accountId,
  });

  if (error) {
    throw error;
  }

  return { success: true };
}

export const updateMemberRoleAction = enhanceAction(updateMemberRole, {
  auth: true,
  schema: updateMemberRoleSchema,
});

export const removeMemberAction = enhanceAction(removeMember, {
  auth: true,
  schema: removeMemberSchema,
});

export const leaveTeamAction = enhanceAction(leaveTeam, {
  auth: true,
  schema: leaveTeamSchema,
});

export const transferOwnershipAction = enhanceAction(transferOwnership, {
  auth: true,
  schema: transferOwnershipSchema,
});
