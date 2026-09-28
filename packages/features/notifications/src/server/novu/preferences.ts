import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Enums } from '@odb/supabase';

export const NOVU_OWNED_CHANNELS = [
  'email',
] as const satisfies readonly Enums<'notification_channel'>[];

export async function resolveNovuChannels(
  client: SupabaseClient<Database>,
  recipientUserId: string,
  eventType: string,
): Promise<Enums<'notification_channel'>[]> {
  const { data, error } = await client
    .from('notification_preference')
    .select('channel, enabled')
    .eq('recipient_user_id', recipientUserId)
    .eq('event_type', eventType);

  if (error) {
    throw error;
  }

  const disabled = new Set(
    (data ?? [])
      .filter((row) => !row.enabled)
      .map((row) => row.channel),
  );

  return NOVU_OWNED_CHANNELS.filter((channel) => !disabled.has(channel));
}
