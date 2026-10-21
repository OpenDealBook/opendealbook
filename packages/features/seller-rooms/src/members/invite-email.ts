import type { SupabaseClient } from '@supabase/supabase-js';

import { EMAIL_TEMPLATE_RENDERERS, personalSender } from '@odb/email-templates';
import { getMailer } from '@odb/mailers';
import { requireEnv } from '@odb/shared/env';
import type { Database } from '@odb/supabase';

import { sellerRoomPath, sellerSignInConfirmUrl } from './entry-rules';

type Admin = SupabaseClient<Database>;

export async function loadPerson(admin: Admin, userId: string) {
  const { data } = await admin
    .from('accounts')
    .select('name, email')
    .eq('primary_owner_user_id', userId)
    .eq('is_personal_account', true)
    .single()
    .throwOnError();

  return data;
}

export async function loadSellerSideNames(admin: Admin, dealId: string) {
  const { data } = await admin
    .from('deal')
    .select('code_name, firm!inner(name), accounts!deal_account_id_fkey(name)')
    .eq('id', dealId)
    .single()
    .throwOnError();

  return {
    teamName: data.accounts.name,
    outsideName: data.code_name ?? data.firm.name,
    dealName: data.firm.name,
  };
}

export async function sendSellerRoomInvite(
  admin: Admin,
  invite: {
    email: string;
    roomId: string;
    dealId: string;
    sentBy: string;
    from: string;
  },
): Promise<void> {
  const [inviter, names, { data, error }] = await Promise.all([
    loadPerson(admin, invite.sentBy),
    loadSellerSideNames(admin, invite.dealId),
    admin.auth.admin.generateLink({ type: 'magiclink', email: invite.email }),
  ]);

  if (error) {
    throw error;
  }

  const rendered = await EMAIL_TEMPLATE_RENDERERS['seller-room-invite']({
    productName: 'Open Deal Book',
    inviterName: inviter.name,
    ...names,
    signInLink: sellerSignInConfirmUrl({
      origin: requireEnv('NEXT_PUBLIC_SITE_URL'),
      tokenHash: data.properties.hashed_token,
      next: sellerRoomPath(invite.roomId),
      email: invite.email,
    }),
  });

  const mailer = await getMailer();

  await mailer.sendEmail({
    to: invite.email,
    ...personalSender(inviter, invite.from),
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });
}

export async function emailRemovedSeller(
  admin: Admin,
  removal: { email: string; dealId: string; sentBy: string; from: string },
): Promise<void> {
  const [remover, names] = await Promise.all([
    loadPerson(admin, removal.sentBy),
    loadSellerSideNames(admin, removal.dealId),
  ]);

  const rendered = await EMAIL_TEMPLATE_RENDERERS['seller-room-removed']({
    productName: 'Open Deal Book',
    removerName: remover.name,
    ...names,
  });

  const mailer = await getMailer();

  await mailer.sendEmail({
    to: removal.email,
    ...personalSender(remover, removal.from),
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });
}
