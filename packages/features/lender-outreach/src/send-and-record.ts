import type { SupabaseClient } from '@supabase/supabase-js';

import { type MailboxConnection, sendAs } from '@odb/mailbox';
import type { Database } from '@odb/supabase';

type Client = SupabaseClient<Database>;

export class MailboxSendFailed extends Error {}

export async function loadTeamMailbox(
  client: Client,
  accountId: string,
): Promise<MailboxConnection | null> {
  const { data } = await client
    .from('mailbox_connection')
    .select('provider, nango_connection_id, provider_config_key, email_address')
    .eq('account_id', accountId)
    .eq('status', 'active')
    .maybeSingle()
    .throwOnError();

  return data === null
    ? null
    : {
        provider: data.provider as MailboxConnection['provider'],
        nangoConnectionId: data.nango_connection_id,
        providerConfigKey: data.provider_config_key,
        emailAddress: data.email_address,
      };
}

export async function sendAndRecordOutreach(
  client: Client,
  send: {
    kind: 'outreach' | 'nudge';
    accountId: string;
    sentBy: string;
    roomIds: string[];
    connection: MailboxConnection;
    email: { to: string; subject: string; body: string; inThread?: string };
  },
) {
  const { data: records } = await client
    .from('lender_room_outreach')
    .insert(
      send.roomIds.map((roomId) => ({
        room_id: roomId,
        account_id: send.accountId,
        sent_by: send.sentBy,
        kind: send.kind,
        status: 'sending' as const,
        to_email: send.email.to,
        subject: send.email.subject,
        body: send.email.body,
      })),
    )
    .select('id')
    .throwOnError();
  const recordIds = records.map((record) => record.id);

  let result;

  try {
    result = await sendAs(send.connection, {
      to: send.email.to,
      subject: send.email.subject,
      text: send.email.body,
      replyTo: send.connection.emailAddress,
      inThread: send.email.inThread,
    });
  } catch (error) {
    await client
      .from('lender_room_outreach')
      .update({ status: 'failed' })
      .in('id', recordIds)
      .throwOnError();

    throw new MailboxSendFailed('Mailbox send failed', { cause: error });
  }

  await client
    .from('lender_room_outreach')
    .update({
      status: 'sent',
      provider_message_id: result.providerMessageId,
      provider_thread_id: result.threadId,
    })
    .in('id', recordIds)
    .throwOnError();
}
