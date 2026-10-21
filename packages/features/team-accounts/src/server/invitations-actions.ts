'use server';

import { z } from 'zod';

import { EMAIL_TEMPLATE_RENDERERS } from '@odb/email-templates';
import { getMailer } from '@odb/mailers';
import { enhanceAction } from '@odb/next/actions';
import { requireEnv } from '@odb/shared/env';
import {
  getSupabaseServerAdminClient,
  getSupabaseServerClient,
} from '@odb/supabase/server';

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

const EMAIL_NOT_SENT =
  "Invitation saved, but the email didn't send. Use Resend.";

async function emailInvitation(invitationId: number) {
  const productAddress = requireEnv('SELLER_DELIVERY_FROM_EMAIL');
  const admin = getSupabaseServerAdminClient();

  const { data: invitation } = await admin
    .from('invitations')
    .select('email, invite_token, invited_by, accounts(name)')
    .eq('id', invitationId)
    .single()
    .throwOnError();

  const { data: inviter } = await admin
    .from('accounts')
    .select('name, email')
    .eq('id', invitation.invited_by)
    .eq('is_personal_account', true)
    .single()
    .throwOnError();

  const rendered = await EMAIL_TEMPLATE_RENDERERS.invitation({
    productName: 'Open Deal Book',
    teamName: invitation.accounts.name,
    inviter: inviter.name,
    invitedEmail: invitation.email,
    invitationLink: `${requireEnv('NEXT_PUBLIC_SITE_URL')}/join?token=${invitation.invite_token}`,
  });

  try {
    const mailer = await getMailer();

    await mailer.sendEmail({
      to: invitation.email,
      from: `"${inviter.name} via Open Deal Book" <${productAddress.match(/<(.+)>/)?.[1] ?? productAddress}>`,
      replyTo: inviter.email!,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
  } catch {
    throw new Error(EMAIL_NOT_SENT);
  }
}

async function inviteMembers(data: InviteMembersData) {
  const client = getSupabaseServerClient();

  const { data: invitations } = await client
    .rpc('add_invitations_to_account', {
      account_slug: data.slug,
      invites: data.invitations.map((invite) => ({
        email: invite.email,
        role: invite.role,
      })),
    })
    .throwOnError();

  for (const invitation of invitations) {
    await emailInvitation(invitation.id);
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

  await client
    .from('invitations')
    .update({ expires_at: expiresAt })
    .eq('id', data.invitationId)
    .select('id')
    .single()
    .throwOnError();

  await emailInvitation(data.invitationId);

  return { success: true };
}

const invitationLinkSchema = z.object({
  invitationId: z.number().int().positive(),
});

async function invitationLink(
  data: z.infer<typeof invitationLinkSchema>,
  user: { id: string },
) {
  const client = getSupabaseServerClient();

  const { data: invitation } = await client
    .from('invitations')
    .select('account_id')
    .eq('id', data.invitationId)
    .single()
    .throwOnError();

  const { data: canManage } = await client
    .rpc('has_permission', {
      user_id: user.id,
      account_id: invitation.account_id,
      permission_name: 'invites.manage',
    })
    .throwOnError();

  if (!canManage) {
    throw new Error('You cannot share invite links for this team.');
  }

  const { data: secret } = await getSupabaseServerAdminClient()
    .from('invitations')
    .select('invite_token')
    .eq('id', data.invitationId)
    .single()
    .throwOnError();

  return { token: secret.invite_token };
}

async function acceptInvitation(
  data: AcceptInvitationData,
  user: { id: string },
) {
  const client = getSupabaseServerAdminClient();

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

export const invitationLinkAction = enhanceAction(invitationLink, {
  auth: true,
  schema: invitationLinkSchema,
});

export const acceptInvitationAction = enhanceAction(acceptInvitation, {
  auth: true,
  schema: acceptInvitationSchema,
});
