import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

const SENDING_GRACE_MS = 15 * 60 * 1000;

export async function failStaleSendingOutreach(): Promise<void> {
  const cutoff = new Date(Date.now() - SENDING_GRACE_MS).toISOString();

  await getSupabaseServerAdminClient()
    .from('lender_room_outreach')
    .update({ status: 'failed' })
    .eq('status', 'sending')
    .lt('sent_at', cutoff)
    .throwOnError();
}
