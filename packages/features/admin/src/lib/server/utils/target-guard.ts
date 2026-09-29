import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@odb/supabase';

export async function assertTargetUserMutable(
  client: SupabaseClient<Database>,
  actorUserId: string,
  targetUserId: string,
): Promise<void> {
  if (targetUserId === actorUserId) {
    throw new Error('You cannot perform this action on your own account');
  }

  const { data } = await client.rpc('is_user_super_admin', {
    target_user_id: targetUserId,
  });

  if (data) {
    throw new Error('You cannot perform this action on another super admin');
  }
}
