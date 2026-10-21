import {
  listThreadMessages,
  MailboxAccessDenied,
  type MailboxConnection,
} from '@odb/mailbox';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

interface TrackedThread {
  roomId: string;
  threadId: string;
  lastSentAt: string;
}

export async function syncLenderReplies(): Promise<void> {
  const admin = getSupabaseServerAdminClient();

  const { data: connections } = await admin
    .from('mailbox_connection')
    .select(
      'account_id, provider, nango_connection_id, provider_config_key, email_address',
    )
    .eq('status', 'active')
    .throwOnError();

  for (const row of connections) {
    const connection: MailboxConnection = {
      provider: row.provider as MailboxConnection['provider'],
      nangoConnectionId: row.nango_connection_id,
      providerConfigKey: row.provider_config_key,
      emailAddress: row.email_address,
    };

    const { data: sends } = await admin
      .from('lender_room_outreach')
      .select('room_id, sent_at, provider_thread_id')
      .eq('account_id', row.account_id)
      .eq('status', 'sent')
      .not('provider_thread_id', 'is', null)
      .throwOnError();

    const { data: rooms } = await admin
      .from('lender_room')
      .select('id, closed_at, expires_at')
      .eq('account_id', row.account_id)
      .throwOnError();
    const now = Date.now();
    const openRoomIds = new Set(
      rooms
        .filter(
          (room) =>
            room.closed_at === null &&
            (room.expires_at === null || Date.parse(room.expires_at) > now),
        )
        .map((room) => room.id),
    );

    const threads = new Map<string, TrackedThread>();
    for (const send of sends.filter(({ room_id }) => openRoomIds.has(room_id))) {
      const threadId = send.provider_thread_id!;
      const tracked = threads.get(threadId);
      if (!tracked || tracked.lastSentAt < send.sent_at) {
        threads.set(threadId, {
          roomId: send.room_id,
          threadId,
          lastSentAt: send.sent_at,
        });
      }
    }

    try {
      for (const thread of threads.values()) {
        const messages = await listThreadMessages(connection, thread.threadId);
        const replies = messages
          .filter(
            (message) =>
              message.fromAddress.toLowerCase() !==
                connection.emailAddress.toLowerCase() &&
              Date.parse(message.receivedAt) > Date.parse(thread.lastSentAt),
          )
          .map((message) => ({
            room_id: thread.roomId,
            account_id: row.account_id,
            received_at: message.receivedAt,
            provider_message_id: message.providerMessageId,
          }));

        if (replies.length > 0) {
          await admin
            .from('lender_room_email_reply')
            .upsert(replies, {
              onConflict: 'room_id,provider_message_id',
              ignoreDuplicates: true,
            })
            .throwOnError();
        }
      }
    } catch (error) {
      if (!(error instanceof MailboxAccessDenied)) {
        throw error;
      }
      console.warn(
        `[workflows] lender reply sync skipped for account ${row.account_id}: mailbox read access denied`,
      );
    }
  }
}
