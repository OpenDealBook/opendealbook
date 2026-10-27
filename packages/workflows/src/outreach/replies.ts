import {
  listThreadMessages,
  MailboxRequestFailed,
  type MailboxConnection,
  type ThreadMessage,
} from '@odb/mailbox';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

type StopReason = 'replied' | 'bounce';

type AdminClient = ReturnType<typeof getSupabaseServerAdminClient>;

interface MailboxConnectionRow {
  account_id: string;
  provider: string;
  nango_connection_id: string;
  provider_config_key: string;
  email_address: string;
}

const DELIVERY_REPORT_SENDER = /^(mailer-daemon|postmaster)@/;

const FINISHED_WATCH_MS = 30 * 86_400_000;

function stopReason(messages: ThreadMessage[], team: Set<string>): StopReason | undefined {
  const senders = messages
    .map((message) => message.fromAddress.toLowerCase())
    .filter((sender) => !team.has(sender));
  if (senders.some((sender) => !DELIVERY_REPORT_SENDER.test(sender))) {
    return 'replied';
  }
  return senders.length > 0 ? 'bounce' : undefined;
}

export async function syncOutreachReplies(): Promise<void> {
  const admin = getSupabaseServerAdminClient();

  const { data: connections } = await admin
    .from('mailbox_connection')
    .select('account_id, provider, nango_connection_id, provider_config_key, email_address')
    .eq('status', 'active')
    .throwOnError();

  for (const row of connections) {
    try {
      await syncTeamReplies(admin, row);
    } catch (error) {
      console.warn(
        `[workflows] outreach reply sync skipped for account ${row.account_id}: ${(error as Error).message}`,
      );
    }
  }
}

async function syncTeamReplies(admin: AdminClient, row: MailboxConnectionRow): Promise<void> {
  const connection: MailboxConnection = {
    provider: row.provider as MailboxConnection['provider'],
    nangoConnectionId: row.nango_connection_id,
    providerConfigKey: row.provider_config_key,
    emailAddress: row.email_address,
  };

  const { data: memberEmails } = await admin
    .rpc('outreach_team_emails', { p_account_id: row.account_id })
    .throwOnError();
  const team = new Set([row.email_address.toLowerCase(), ...memberEmails]);

  const { data: recorded } = await admin
    .from('outreach_message')
    .select(
      'enrollment_id, provider_thread_id, sent_at, from_email, outreach_enrollment!inner(account_id, status, target_email)',
    )
    .eq('outreach_enrollment.account_id', row.account_id)
    .in('outreach_enrollment.status', ['queued', 'held', 'sent'])
    .eq('status', 'sent')
    .not('provider_thread_id', 'is', null)
    .throwOnError();
  const sends = recorded.filter(
    (send) => send.from_email?.toLowerCase() === row.email_address.toLowerCase(),
  );
  const targets = new Map(
    sends.map((send) => [send.enrollment_id, send.outreach_enrollment.target_email]),
  );
  const finished = new Set(
    sends
      .filter((send) => send.outreach_enrollment.status === 'sent')
      .map((send) => send.enrollment_id),
  );

  const lastTouch = new Map<string, string>();
  for (const send of sends) {
    if (send.sent_at! > (lastTouch.get(send.enrollment_id) ?? '')) {
      lastTouch.set(send.enrollment_id, send.sent_at!);
    }
  }
  const watchFrom = new Date(Date.now() - FINISHED_WATCH_MS).toISOString();
  const watched = sends.filter(
    (send) =>
      !finished.has(send.enrollment_id) || lastTouch.get(send.enrollment_id)! >= watchFrom,
  );

  for (const send of watched) {
    let messages: ThreadMessage[];
    try {
      messages = await listThreadMessages(connection, send.provider_thread_id!);
    } catch (error) {
      if (error instanceof MailboxRequestFailed && (error.status === 404 || error.status === 429)) {
        continue;
      }
      throw error;
    }
    const reason = stopReason(messages, team);
    if (reason !== undefined) {
      await admin
        .rpc('stop_outreach_to', {
          p_account_id: row.account_id,
          p_email: targets.get(send.enrollment_id)!,
          p_reason: reason,
        })
        .throwOnError();
    }
  }
}
