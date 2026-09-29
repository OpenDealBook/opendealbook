import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Json } from '@odb/supabase';

export async function recordAdminAction(
  client: SupabaseClient<Database>,
  entry: {
    actorUserId: string;
    action: string;
    targetType: string;
    targetId: string;
    detail?: Json;
  },
): Promise<void> {
  await client.from('admin_action_log').insert({
    actor_user_id: entry.actorUserId,
    action: entry.action,
    target_type: entry.targetType,
    target_id: entry.targetId,
    detail: entry.detail ?? {},
  });
}
