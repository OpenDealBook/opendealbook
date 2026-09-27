'use server';

import { enhanceAction } from '@tuckin/next/actions';
import { getSupabaseServerClient } from '@tuckin/supabase/server';

import {
  acceptInvitationSchema,
  resendInvitationSchema,
  revokeInvitationSchema,
  type AcceptInvitationData,
  type ResendInvitationData,
  type RevokeInvitationData,
} from '../schema/invitation.schema';
import {
  inviteMembersSchema,
  type InviteMembersData,
} from '../schema/invite-members.schema';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function inviteMembers(data: InviteMembersData, user: { id: string }) {
  const client = getSupabaseServerClient();

  const { error } = await client.rpc('add_invitations_to_account', {
    account_slug: data.slug,
    invited_by: user.id,
    invites: data.invitations.map((invite) => ({
      email: invite.email,
      role: invite.role,
    })),
  });

  if (error) {
    throw error;
  }

  return { success: true };
}

async function revokeInvitation(data: RevokeInvitationData) {
  const client = getSupabaseServerClient();

  const { error } = await client
    .from('invitations')
    .delete()
    .eq('id', data.invitationId);

  if (error) {
    throw error;
  }

  return { success: true };
}

async function resendInvitation(data: ResendInvitationData) {
  const client = getSupabaseServerClient();

  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS).toISOString();

  const { error } = await client
    .from('invitations')
    .update({ expires_at: expiresAt })
    .eq('id', data.invitationId);

  if (error) {
    throw error;
  }

  return { success: true };
}

async function acceptInvitation(
  data: AcceptInvitationData,
  user: { id: string },
) {
  const client = getSupabaseServerClient();

  const { data: accountId, error } = await client.rpc('accept_invitation', {
    token: data.token,
    user_id: user.id,
  });

  if (error) {
    throw error;
  }

  return { accountId };
}

export const inviteMembersAction = enhanceAction(inviteMembers, {
  auth: true,
  schema: inviteMembersSchema,
});

export const revokeInvitationAction = enhanceAction(revokeInvitation, {
  auth: true,
  schema: revokeInvitationSchema,
});

export const resendInvitationAction = enhanceAction(resendInvitation, {
  auth: true,
  schema: resendInvitationSchema,
});

export const acceptInvitationAction = enhanceAction(acceptInvitation, {
  auth: true,
  schema: acceptInvitationSchema,
});
