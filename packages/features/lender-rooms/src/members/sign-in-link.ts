import type { SupabaseClient } from '@supabase/supabase-js';

import { z } from 'zod';

import {
  personalSender,
  renderLenderInviteEmail,
  renderLenderSignInEmail,
  type RenderedEmail,
} from '@odb/email-templates';
import { getMailer } from '@odb/mailers';
import type { Database } from '@odb/supabase';

import { headerFacts } from '../browser/header-facts';
import { signInConfirmUrl } from './entry-rules';

type Admin = SupabaseClient<Database>;

export async function claimSignInLinkWindow(
  admin: Admin,
  email: string,
): Promise<boolean> {
  const { data: passed } = await admin
    .rpc('lender_rate_limit_pass', {
      key: `signin:${email}`,
      window_seconds: 120,
    })
    .throwOnError();

  return passed;
}

function lenderRoomsFrom(): string {
  return (
    process.env.LENDER_ROOMS_FROM_EMAIL ??
    'Open Deal Book <hello@opendealbook.app>'
  );
}

async function signInLink(admin: Admin, email: string, next: string) {
  const origin = process.env.NEXT_PUBLIC_SITE_URL;

  if (!origin) {
    throw new Error(
      'Missing required environment variable: NEXT_PUBLIC_SITE_URL',
    );
  }

  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });

  if (error) {
    throw error;
  }

  return signInConfirmUrl({
    origin,
    tokenHash: data.properties.hashed_token,
    next,
  });
}

async function mail(
  to: string,
  rendered: RenderedEmail,
  sender: { from: string; replyTo?: string },
): Promise<void> {
  const mailer = await getMailer();

  await mailer.sendEmail({
    to,
    ...sender,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });
}

export async function sendSignInLink(
  admin: Admin,
  { email, next }: { email: string; next: string },
): Promise<void> {
  const rendered = await renderLenderSignInEmail({
    productName: 'Open Deal Book',
    signInLink: await signInLink(admin, email, next),
  });

  await mail(email, rendered, { from: lenderRoomsFrom() });
}

export async function sendLenderInvite(
  admin: Admin,
  invite: { email: string; roomId: string; sentBy: string },
): Promise<void> {
  const [{ data: room }, { data: inviter }] = await Promise.all([
    admin
      .rpc('lender_room_view', { room_id: invite.roomId })
      .single()
      .throwOnError(),
    admin
      .from('accounts')
      .select('name, email')
      .eq('primary_owner_user_id', invite.sentBy)
      .eq('is_personal_account', true)
      .single()
      .throwOnError(),
  ]);
  const facts = headerFacts(room);

  const rendered = await renderLenderInviteEmail({
    productName: 'Open Deal Book',
    inviterName: inviter.name,
    buyerTeam: z.string().parse(facts.buyerTeam),
    outsideName: z.string().parse(facts.dealName),
    loanAsk: facts.loanAsk,
    closeBy: facts.closeBy,
    signInLink: await signInLink(
      admin,
      invite.email,
      `/lender/${invite.roomId}`,
    ),
  });

  await mail(
    invite.email,
    rendered,
    personalSender(inviter, lenderRoomsFrom()),
  );
}
