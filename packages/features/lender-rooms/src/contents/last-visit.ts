import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

import { z } from 'zod';

import type { Database } from '@odb/supabase';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

const SAME_VISIT_WINDOW_MS = 30 * 60 * 1000;

export async function getLastRoomVisit(
  client: SupabaseClient<Database>,
  roomId: string,
): Promise<string | null> {
  const userResult = await client.auth.getUser();
  const userId = z.string().parse(userResult.data.user?.id);

  const { data: isMember } = await client
    .rpc('is_lender_room_member', { room_id: roomId })
    .throwOnError();
  // Lenders cannot read activity, so a verified member's own rows are read
  // with the service role.
  const serviceRoleForMemberElseOwnClient = isMember
    ? getSupabaseServerAdminClient()
    : client;

  const { data: lastOpen } = await serviceRoleForMemberElseOwnClient
    .from('lender_room_activity')
    .select('created_at')
    .eq('room_id', roomId)
    .eq('user_id', userId)
    .eq('action', 'room_opened')
    .lt('created_at', new Date(Date.now() - SAME_VISIT_WINDOW_MS).toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
    .throwOnError();

  return lastOpen?.created_at ?? null;
}
