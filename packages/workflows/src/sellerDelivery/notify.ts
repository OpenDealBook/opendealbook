import { z } from 'zod';

import { EMAIL_TEMPLATE_RENDERERS } from '@odb/email-templates';
import { getMailer } from '@odb/mailers';
import { dealPath } from '@odb/notifications/relay';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

import { dealManagerIds } from '../dealManagers';

export interface SellerDeliveryProblem {
  accountId: string;
  dealId: string;
  senderUserId: string;
  message: string;
}

export async function notifyTeamOfSellerDeliveryProblem(
  problem: SellerDeliveryProblem,
): Promise<void> {
  const admin = getSupabaseServerAdminClient();
  const recipients = new Set([
    problem.senderUserId,
    ...(await dealManagerIds(problem.accountId)),
  ]);
  const { data: team } = await admin
    .from('accounts')
    .select('slug')
    .eq('id', problem.accountId)
    .single()
    .throwOnError();

  await admin
    .from('notifications')
    .insert(
      [...recipients].map((recipientUserId) => ({
        account_id: problem.accountId,
        recipient_user_id: recipientUserId,
        deal_id: problem.dealId,
        type: 'error' as const,
        body: problem.message,
        link: `${dealPath(z.string().parse(team.slug), problem.dealId)}/parties#seller-room`,
      })),
    )
    .throwOnError();
}

export async function emailSenderOfSellerDeliveryProblem(
  problem: SellerDeliveryProblem,
): Promise<void> {
  const from = process.env.SELLER_DELIVERY_FROM_EMAIL;

  if (!from) {
    return;
  }

  const admin = getSupabaseServerAdminClient();

  const { data: sender, error } = await admin.auth.admin.getUserById(
    problem.senderUserId,
  );

  if (error) {
    throw error;
  }

  const rendered = await EMAIL_TEMPLATE_RENDERERS['seller-delivery-problem']({
    productName: 'Open Deal Book',
    message: problem.message,
  });

  const mailer = await getMailer();

  await mailer.sendEmail({
    to: sender.user.email!,
    from,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });
}
