import type { SupabaseClient } from '@supabase/supabase-js';

import { EMAIL_TEMPLATE_RENDERERS, personalSender } from '@odb/email-templates';
import { getMailer } from '@odb/mailers';
import { requireEnv } from '@odb/shared/env';
import type { Database } from '@odb/supabase';

import { sellerRoomPath } from '../members/entry-rules';
import { loadPerson } from '../members/invite-email';

export async function emailSellersAboutQuestion(
  admin: SupabaseClient<Database>,
  question: { roomId: string; title: string; from: string; askedBy: string },
): Promise<void> {
  const [{ data: members }, { data: room }, asker] = await Promise.all([
    admin
      .from('seller_room_member')
      .select('email')
      .eq('room_id', question.roomId)
      .throwOnError(),
    admin
      .from('seller_room')
      .select('accounts(name), deal!inner(code_name, firm!inner(name))')
      .eq('id', question.roomId)
      .single()
      .throwOnError(),
    loadPerson(admin, question.askedBy),
  ]);

  const rendered = await EMAIL_TEMPLATE_RENDERERS['seller-question']({
    productName: 'Open Deal Book',
    askerName: asker.name,
    teamName: room.accounts.name,
    outsideName: room.deal.code_name ?? room.deal.firm.name,
    dealName: room.deal.firm.name,
    questionTitle: question.title,
    roomLink: `${requireEnv('NEXT_PUBLIC_SITE_URL')}${sellerRoomPath(question.roomId)}`,
  });

  const mailer = await getMailer();

  await Promise.all(
    members.map((member) =>
      mailer.sendEmail({
        to: member.email,
        ...personalSender(asker, question.from),
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      }),
    ),
  );
}
