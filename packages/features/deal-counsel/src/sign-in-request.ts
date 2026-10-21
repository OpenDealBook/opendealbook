import type { SupabaseClient } from '@supabase/supabase-js';

import { EMAIL_TEMPLATE_RENDERERS, personalSender } from '@odb/email-templates';
import { getMailer } from '@odb/mailers';
import { findSeller } from '@odb/seller-rooms/members/find-or-create-seller.ts';
import type { Database } from '@odb/supabase';

import {
  COUNSEL_DEALS_PATH,
  counselPortalDealId,
  counselPortalPath,
  counselSignInConfirmUrl,
} from './entry-rules';

const SIGN_IN_WINDOW_SECONDS = 120;

export interface CounselSignInSettings {
  origin: string;
  from: string;
}

export async function claimCounselSignInWindow(
  admin: SupabaseClient<Database>,
  email: string,
): Promise<boolean> {
  const { data: passed } = await admin
    .rpc('lender_rate_limit_pass', {
      key: `counsel-signin:${email}`,
      window_seconds: SIGN_IN_WINDOW_SECONDS,
    })
    .throwOnError();

  return passed;
}

export interface CounselInviteCopy {
  inviter: { name: string; email: string | null };
  teamName: string;
  outsideName: string;
  dealName: string;
}

export async function sendCounselSignInLink(
  admin: SupabaseClient<Database>,
  link: {
    email: string;
    dealId: string;
    side: Database['public']['Enums']['counsel_side'];
    copy: CounselInviteCopy;
  },
  settings: CounselSignInSettings,
): Promise<void> {
  const { inviter, ...names } = link.copy;
  const rendered = await EMAIL_TEMPLATE_RENDERERS['counsel-invite']({
    productName: 'Open Deal Book',
    side: link.side,
    inviterName: inviter.name,
    ...names,
    signInLink: await signInLink(
      admin,
      link.email,
      counselPortalPath(link.dealId),
      settings,
    ),
  });

  await mail(link.email, rendered, personalSender(inviter, settings.from));
}

async function sendCounselSignInEmail(
  admin: SupabaseClient<Database>,
  link: {
    email: string;
    next: string;
    deals: { name: string; outsideName: string }[];
  },
  settings: CounselSignInSettings,
): Promise<void> {
  const rendered = await EMAIL_TEMPLATE_RENDERERS['counsel-sign-in']({
    productName: 'Open Deal Book',
    deals: link.deals,
    signInLink: await signInLink(admin, link.email, link.next, settings),
  });

  await mail(link.email, rendered, { from: settings.from });
}

async function signInLink(
  admin: SupabaseClient<Database>,
  email: string,
  next: string,
  settings: CounselSignInSettings,
): Promise<string> {
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });

  if (error) {
    throw error;
  }

  return counselSignInConfirmUrl({
    origin: settings.origin,
    tokenHash: data.properties.hashed_token,
    next,
    email,
  });
}

async function mail(
  to: string,
  rendered: { subject: string; html: string; text: string },
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

export async function requestCounselSignIn(
  admin: SupabaseClient<Database>,
  input: { email: string; next: string },
  settings: CounselSignInSettings,
): Promise<void> {
  const userId = await findSeller(admin, input.email);

  if (!userId) {
    return;
  }

  const openDeals = await openCounselDeals(admin, userId);
  const asked =
    input.next === COUNSEL_DEALS_PATH
      ? openDeals
      : openDeals.filter((deal) => deal.id === counselPortalDealId(input.next));

  if (asked.length === 0) {
    return;
  }

  if (!(await claimCounselSignInWindow(admin, input.email))) {
    return;
  }

  await sendCounselSignInEmail(
    admin,
    {
      email: input.email,
      next:
        asked.length === 1
          ? counselPortalPath(asked[0]!.id)
          : COUNSEL_DEALS_PATH,
      deals: asked,
    },
    settings,
  );
}

async function openCounselDeals(
  admin: SupabaseClient<Database>,
  userId: string,
): Promise<{ id: string; name: string; outsideName: string }[]> {
  const { data: open } = await admin
    .from('deal_counsel')
    .select(
      'deal_id, side, deal!inner(code_name, archived_at, resolution, firm!inner(name))',
    )
    .eq('user_id', userId)
    .is('deal.archived_at', null)
    .is('deal.resolution', null)
    .throwOnError();

  return open.map((row) => {
    const outsideName = row.deal.code_name ?? row.deal.firm.name;

    return {
      id: row.deal_id,
      name: row.side === 'buyer' ? outsideName : row.deal.firm.name,
      outsideName,
    };
  });
}
