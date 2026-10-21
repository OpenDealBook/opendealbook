import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

const SENDING_GRACE_MS = 15 * 60 * 1000;

export async function failStaleSendingOutreachMessages(): Promise<void> {
  const client = getSupabaseServerAdminClient();
  const cutoff = new Date(Date.now() - SENDING_GRACE_MS).toISOString();

  const { data: stale } = await client
    .from('outreach_message')
    .update({ status: 'failed' })
    .eq('status', 'sending')
    .lt('sent_at', cutoff)
    .select('enrollment_id')
    .throwOnError();

  await client
    .from('outreach_enrollment')
    .update({ status: 'failed' })
    .in('id', stale.map((message) => message.enrollment_id))
    .throwOnError();
}
